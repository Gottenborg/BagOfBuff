import type Stripe from "stripe";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  orderItems,
  orders,
  products,
  type Order,
  type Product,
} from "../../db/schema";
import { sendOrderConfirmation } from "../../lib/email";
import { currencyForCountry } from "../../lib/currency";
import { rateForCountry, vatFromGross } from "../../lib/vat";
import { recordOrderEvent } from "../orders/order-events.service";
import { moveStock } from "../products/stock.service";
import { pricesForProducts, resolvePrice } from "../products/prices";
import { env } from "../../lib/env";
import { checkoutConfigProblem, getStripe, isLiveMode } from "../../lib/stripe";
import {
  computeOptions,
  normalizeCountry,
  ratesForZone,
  resolveZoneForCountry,
  type ShippingOption,
} from "../shipping/shipping.service";

/**
 * Stripe tax codes: general tangible goods and shipping.
 *
 * Kept on the line items even though `automatic_tax` is off, so that enabling
 * Stripe Tax later (see lib/vat: at the EU OSS threshold) is a one-flag change
 * rather than a re-classification of the catalogue.
 */
const TAX_CODE_GOODS = "txcd_99999999";
const TAX_CODE_SHIPPING = "txcd_92010001";

export interface CheckoutItemInput {
  slug: string;
  quantity: number;
}

export interface CreateCheckoutInput {
  items: CheckoutItemInput[];
  country: string;
  /** Chosen shipping rate id (from `POST /shipping/quote`). */
  shippingRateId: string;
  /** Optional — Stripe also collects it, but we prefill when known. */
  email?: string | null;
}

export type CreateCheckoutResult =
  | { ok: true; url: string; sessionId: string; orderId: string }
  | { ok: false; status: 400 | 404 | 409 | 503; message: string };

/**
 * Validates a cart against the live catalogue, resolves shipping, creates a
 * `pending` order, and opens a hosted Stripe Checkout session (with Stripe Tax)
 * for it. Prices come from the database, never the client, so a tampered cart
 * cannot change what is charged.
 */
export async function createCheckoutSession(
  input: CreateCheckoutInput,
): Promise<CreateCheckoutResult> {
  const stripe = getStripe();
  if (!stripe) {
    return { ok: false, status: 503, message: "Checkout is not configured" };
  }

  // Refuse to take real money into a misconfigured redirect. In test mode this
  // is only a warning (logged at boot), because localhost is where test-mode
  // checkouts are supposed to land.
  const configProblem = checkoutConfigProblem();
  if (configProblem && isLiveMode()) {
    console.error("Refusing live checkout:", configProblem);
    return { ok: false, status: 503, message: "Checkout is misconfigured" };
  }

  if (input.items.length === 0) {
    return { ok: false, status: 400, message: "Cart is empty" };
  }

  // Collapse duplicate slugs and reject non-positive quantities.
  const wanted = new Map<string, number>();
  for (const item of input.items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return {
        ok: false,
        status: 400,
        message: `Invalid quantity for ${item.slug}`,
      };
    }
    wanted.set(item.slug, (wanted.get(item.slug) ?? 0) + item.quantity);
  }

  const slugs = [...wanted.keys()];
  const found = await db
    .select()
    .from(products)
    .where(inArray(products.slug, slugs));
  const bySlug = new Map<string, Product>(found.map((p) => [p.slug, p]));

  // The destination decides the currency for the whole session: goods and
  // shipping must be denominated identically, because a Stripe Checkout session
  // has exactly one currency.
  const country = normalizeCountry(input.country);
  const currency = currencyForCountry(country);
  const priceMap = await pricesForProducts(found.map((p) => p.id));

  const lines: {
    product: Product;
    quantity: number;
    unitPriceCents: number;
  }[] = [];
  for (const slug of slugs) {
    const product = bySlug.get(slug);
    if (!product || !product.active) {
      return { ok: false, status: 404, message: `Unavailable product: ${slug}` };
    }
    const quantity = wanted.get(slug)!;
    if (product.stock < quantity) {
      return {
        ok: false,
        status: 409,
        message: `Not enough stock for ${product.name}`,
      };
    }
    const price = resolvePrice(product, priceMap.get(product.id), currency);
    if (price.currency !== currency) {
      return {
        ok: false,
        status: 409,
        message: `${product.name} is not priced in ${currency} yet`,
      };
    }
    lines.push({ product, quantity, unitPriceCents: price.priceCents });
  }

  const subtotalCents = lines.reduce(
    (sum, l) => sum + l.unitPriceCents * l.quantity,
    0,
  );

  // Resolve shipping for the destination and the chosen rate.
  const zone = await resolveZoneForCountry(country);
  if (!zone) {
    return { ok: false, status: 404, message: `We don't ship to ${country}` };
  }
  const rates = await ratesForZone(zone.id, currency);
  const options = computeOptions(rates, subtotalCents);
  const option = options.find((o) => o.id === input.shippingRateId);
  if (!option) {
    return {
      ok: false,
      status: 400,
      message: "Selected shipping option is unavailable",
    };
  }

  // Create the pending order first so its id can go into session metadata.
  const [order] = await db
    .insert(orders)
    .values({
      status: "pending",
      email: input.email ?? null,
      // Placeholder until the session exists; updated immediately below.
      stripeSessionId: `pending_${crypto.randomUUID()}`,
      currency,
      subtotalCents,
      shippingCents: option.priceCents,
      shippingRateId: option.id,
      shippingRateName: option.name,
      shipCountry: country,
    })
    .returning();

  await db.insert(orderItems).values(
    lines.map((l) => ({
      orderId: order!.id,
      productId: l.product.id,
      slug: l.product.slug,
      name: l.product.name,
      unitPriceCents: l.unitPriceCents,
      currency,
      quantity: l.quantity,
    })),
  );

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lines.map((l) => ({
      quantity: l.quantity,
      price_data: {
        currency: currency.toLowerCase(),
        unit_amount: l.unitPriceCents,
        // Storefront prices are shown VAT-inclusive; Stripe Tax splits out the
        // VAT portion based on the ship-to country.
        tax_behavior: "inclusive",
        product_data: {
          name: l.product.name,
          tax_code: TAX_CODE_GOODS,
        },
      },
    })),
    shipping_options: [buildShippingOption(option, currency)],
    // VAT is calculated in-house (lib/vat) rather than by Stripe Tax: under the
    // EU OSS threshold every EU sale carries Danish VAT, so there is nothing to
    // look up, and prices are already VAT-inclusive. Revisit at the threshold —
    // `ossStatus` reports the position.
    automatic_tax: { enabled: false },
    // The shipping address is still what decides the VAT treatment.
    shipping_address_collection: {
      allowed_countries: allowedCountries(zone.countries),
    },
    billing_address_collection: "auto",
    ...(input.email ? { customer_email: input.email } : {}),
    metadata: { orderId: order!.id },
    // Carry our order id to the confirmation page so it can look the order up
    // (Stripe substitutes {CHECKOUT_SESSION_ID} itself).
    success_url: appendParam(env.CHECKOUT_SUCCESS_URL, "order_id", order!.id),
    cancel_url: env.CHECKOUT_CANCEL_URL,
  });

  if (!session.url) {
    return { ok: false, status: 503, message: "Stripe did not return a URL" };
  }

  await db
    .update(orders)
    .set({ stripeSessionId: session.id, updatedAt: new Date() })
    .where(eq(orders.id, order!.id));

  await recordOrderEvent({
    orderId: order!.id,
    type: "order.created",
    actor: "customer",
    message: `Checkout started — ${lines.length} line(s), ${option.name} shipping`,
    data: {
      currency,
      subtotalCents,
      shippingCents: option.priceCents,
      country,
    },
  });

  return { ok: true, url: session.url, sessionId: session.id, orderId: order!.id };
}

function buildShippingOption(
  option: ShippingOption,
  currency: string,
): Stripe.Checkout.SessionCreateParams.ShippingOption {
  const delivery_estimate =
    option.minDeliveryDays !== null && option.maxDeliveryDays !== null
      ? {
          minimum: { unit: "business_day" as const, value: option.minDeliveryDays },
          maximum: { unit: "business_day" as const, value: option.maxDeliveryDays },
        }
      : undefined;

  return {
    shipping_rate_data: {
      type: "fixed_amount",
      display_name: option.name,
      fixed_amount: {
        amount: option.priceCents,
        currency: currency.toLowerCase(),
      },
      tax_behavior: "inclusive",
      tax_code: TAX_CODE_SHIPPING,
      ...(delivery_estimate ? { delivery_estimate } : {}),
    },
  };
}

/**
 * Appends a query parameter by string concatenation. We avoid the URL API here
 * so Stripe's literal `{CHECKOUT_SESSION_ID}` placeholder isn't percent-encoded.
 */
function appendParam(url: string, key: string, value: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${key}=${encodeURIComponent(value)}`;
}

/** Stripe expects ISO-3166-1 alpha-2 codes; our zones already store them. */
function allowedCountries(
  countries: string[],
): Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] {
  return countries.map(
    (c) =>
      c as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry,
  );
}

/**
 * Marks the order for a completed checkout session as paid: records Stripe's
 * authoritative amounts + address, decrements stock, and sends the confirmation
 * email. Idempotent — a redelivered event for an already-paid order is a no-op.
 */
export async function fulfillCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const orderId = session.metadata?.orderId;
  if (!orderId) {
    console.warn(`Checkout session ${session.id} has no orderId metadata`);
    return;
  }

  const [existing] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!existing) {
    console.warn(`No order ${orderId} for session ${session.id}`);
    return;
  }
  if (existing.status === "paid" || existing.status === "fulfilled") {
    return; // already processed
  }

  const ship = session.collected_information?.shipping_details;
  const addr = ship?.address;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  const [updated] = await db
    .update(orders)
    .set({
      status: "paid",
      stripePaymentIntentId: paymentIntentId,
      email: session.customer_details?.email ?? existing.email,
      // The VAT contained in what was actually charged, at the rate for where
      // it shipped. Derived from the final total so any Stripe-side adjustment
      // (discount, shipping change) is reflected rather than assumed.
      taxCents: vatFromGross(
        session.amount_total ?? existing.totalCents ?? 0,
        rateForCountry(addr?.country ?? existing.shipCountry),
      ),
      totalCents: session.amount_total ?? existing.totalCents,
      shippingCents:
        session.total_details?.amount_shipping ?? existing.shippingCents,
      shipName: ship?.name ?? existing.shipName,
      shipLine1: addr?.line1 ?? existing.shipLine1,
      shipLine2: addr?.line2 ?? existing.shipLine2,
      shipCity: addr?.city ?? existing.shipCity,
      shipPostalCode: addr?.postal_code ?? existing.shipPostalCode,
      shipCountry: addr?.country ?? existing.shipCountry,
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId))
    .returning();

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  // Decrement stock through the ledger, so the balance stays explainable.
  for (const item of items) {
    if (!item.productId) continue;
    await moveStock({
      productId: item.productId,
      delta: -item.quantity,
      reason: "sale",
      orderId,
      note: item.name,
    });
  }

  await recordOrderEvent({
    orderId,
    type: "order.paid",
    actor: "stripe",
    message: `Payment received — ${((updated!.totalCents ?? 0) / 100).toFixed(2)} ${updated!.currency}`,
    data: {
      totalCents: updated!.totalCents,
      taxCents: updated!.taxCents,
      currency: updated!.currency,
      paymentIntentId: paymentIntentId,
    },
  });

  // The confirmation email is the customer's receipt, so whether it went is
  // part of the order's history — especially when they say they never got one.
  const emailed = await sendOrderConfirmation(updated as Order, items);
  await recordOrderEvent({
    orderId,
    type: emailed ? "email.sent" : "email.failed",
    actor: "system",
    message: emailed
      ? `Order confirmation sent to ${updated!.email ?? "the customer"}`
      : "Order confirmation was not sent (email is not configured, or the provider rejected it)",
    data: { to: updated!.email },
  });
}

/** Marks a pending order canceled when its checkout session expires. */
export async function expireCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const orderId = session.metadata?.orderId;
  if (!orderId) return;
  const canceled = await db
    .update(orders)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.status, "pending")))
    .returning({ id: orders.id });

  // Only log a real transition: Stripe can redeliver, and an order that was
  // already canceled hasn't expired a second time.
  if (canceled.length > 0) {
    await recordOrderEvent({
      orderId,
      type: "order.expired",
      actor: "stripe",
      message: "Checkout session expired — order canceled",
    });
  }
}
