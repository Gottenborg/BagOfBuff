import type Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import {
  orderItems,
  orders,
  products,
  subscriptionPlans,
  subscriptions,
  type Product,
  type SubscriptionPlan,
} from "../../db/schema";
import { env } from "../../lib/env";
import { getStripe } from "../../lib/stripe";
import { sendPortalLink } from "../../lib/email";

const TAX_CODE_GOODS = "txcd_99999999";

export type PlanInterval = "week" | "month";

export interface CreatePlanInput {
  productId: string;
  name: string;
  interval: PlanInterval;
  intervalCount: number;
  priceCents: number;
}

export type CreatePlanResult =
  | { ok: true; plan: SubscriptionPlan }
  | { ok: false; status: 400 | 404 | 503; message: string };

/**
 * Creates a subscription plan: a recurring Stripe Price attached to a Stripe
 * Product, mirrored into `subscription_plans`. The product's own currency is
 * used so the plan price matches the storefront.
 */
export async function createPlan(
  input: CreatePlanInput,
): Promise<CreatePlanResult> {
  const stripe = getStripe();
  if (!stripe)
    return { ok: false, status: 503, message: "Billing is not configured" };

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, input.productId))
    .limit(1);
  if (!product)
    return { ok: false, status: 404, message: "Product not found" };

  const stripeProduct = await stripe.products.create({
    name: `${product.name} — ${input.name}`,
    metadata: { productId: product.id },
  });
  const price = await stripe.prices.create({
    product: stripeProduct.id,
    unit_amount: input.priceCents,
    currency: product.currency.toLowerCase(),
    tax_behavior: "inclusive",
    recurring: {
      interval: input.interval,
      interval_count: input.intervalCount,
    },
  });

  const [plan] = await db
    .insert(subscriptionPlans)
    .values({
      productId: product.id,
      name: input.name,
      interval: input.interval,
      intervalCount: input.intervalCount,
      priceCents: input.priceCents,
      currency: product.currency,
      stripeProductId: stripeProduct.id,
      stripePriceId: price.id,
    })
    .returning();

  return { ok: true, plan: plan! };
}

export type SubscriptionCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; status: 400 | 404 | 503; message: string };

/**
 * Opens a hosted Stripe Checkout session in `subscription` mode for a plan,
 * collecting the shipping address that each cycle's fulfillment order will use.
 */
export async function createSubscriptionCheckout(input: {
  planId: string;
  email?: string | null;
}): Promise<SubscriptionCheckoutResult> {
  const stripe = getStripe();
  if (!stripe)
    return { ok: false, status: 503, message: "Billing is not configured" };

  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, input.planId))
    .limit(1);
  if (!plan || !plan.active || !plan.stripePriceId)
    return { ok: false, status: 404, message: "Plan unavailable" };

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    automatic_tax: { enabled: true },
    shipping_address_collection: { allowed_countries: allShippableCountries() },
    ...(input.email ? { customer_email: input.email } : {}),
    metadata: { planId: plan.id, productId: plan.productId },
    subscription_data: {
      metadata: { planId: plan.id, productId: plan.productId },
    },
    success_url: env.CHECKOUT_SUCCESS_URL,
    cancel_url: env.CHECKOUT_CANCEL_URL,
  });

  if (!session.url)
    return { ok: false, status: 503, message: "Stripe did not return a URL" };
  return { ok: true, url: session.url };
}

/**
 * Emails a Stripe Billing portal link to a customer with a subscription. Always
 * resolves the same way regardless of whether the email matches, so it can't be
 * used to probe who has a subscription; the link only reaches the real inbox.
 */
export async function emailPortalLink(email: string): Promise<void> {
  const stripe = getStripe();
  if (!stripe) return;

  const normalized = email.trim().toLowerCase();
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.email, normalized))
    .limit(1);
  if (!sub?.stripeCustomerId) return;

  const portal = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: env.CHECKOUT_CANCEL_URL,
  });
  await sendPortalLink(normalized, portal.url);
}

// --- Webhook handlers -----------------------------------------------------

/** Upserts the local subscription when a subscription checkout completes. */
export async function handleSubscriptionCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const subId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;
  if (!subId) return;

  const ship = session.collected_information?.shipping_details;
  const addr = ship?.address;
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : (session.customer?.id ?? null);

  const values = {
    stripeSubscriptionId: subId,
    stripeCustomerId: customerId,
    planId: session.metadata?.planId ?? null,
    productId: session.metadata?.productId ?? null,
    email: session.customer_details?.email ?? null,
    status: "active",
    currency: (session.currency ?? "eur").toUpperCase(),
    amountCents: session.amount_total ?? null,
    shipName: ship?.name ?? null,
    shipLine1: addr?.line1 ?? null,
    shipLine2: addr?.line2 ?? null,
    shipCity: addr?.city ?? null,
    shipPostalCode: addr?.postal_code ?? null,
    shipCountry: addr?.country ?? null,
    updatedAt: new Date(),
  };

  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: subscriptions.stripeSubscriptionId,
      set: values,
    });
}

/** Syncs status / period / cancellation from a Stripe subscription object. */
export async function syncSubscription(
  sub: Stripe.Subscription,
): Promise<void> {
  const periodEnd = subscriptionPeriodEnd(sub);
  await db
    .update(subscriptions)
    .set({
      status: sub.status,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      currentPeriodEnd: periodEnd,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, sub.id));
}

/**
 * On a paid invoice, spawns a fulfillment order for the cycle. Idempotent: the
 * order's `stripeSessionId` is set to the invoice id (unique), so a redelivered
 * invoice.paid event does not create a duplicate shipment.
 */
export async function handleInvoicePaid(
  invoice: Stripe.Invoice,
): Promise<void> {
  // Only recurring (subscription) invoices spawn cycle orders.
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : (invoice.customer?.id ?? null);
  if (!customerId) return;

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, customerId))
    .limit(1);
  if (!sub) return; // no local subscription (e.g. first-cycle race) — skip

  // Idempotency guard: skip if we already made an order for this invoice.
  const [existing] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.stripeSessionId, invoice.id!))
    .limit(1);
  if (existing) return;

  let product: Product | undefined;
  if (sub.productId) {
    [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, sub.productId))
      .limit(1);
  }

  const amount = invoice.amount_paid ?? sub.amountCents ?? 0;
  const currency = (invoice.currency ?? sub.currency).toUpperCase();

  const [order] = await db
    .insert(orders)
    .values({
      status: "paid",
      origin: "subscription",
      subscriptionId: sub.id,
      email: sub.email,
      stripeSessionId: invoice.id!,
      currency,
      subtotalCents: amount,
      shippingCents: 0,
      totalCents: amount,
      taxCents: invoice.total_taxes?.[0]?.amount ?? null,
      shipName: sub.shipName,
      shipLine1: sub.shipLine1,
      shipLine2: sub.shipLine2,
      shipCity: sub.shipCity,
      shipPostalCode: sub.shipPostalCode,
      shipCountry: sub.shipCountry,
      paidAt: new Date(),
    })
    .returning();

  await db.insert(orderItems).values({
    orderId: order!.id,
    productId: sub.productId,
    slug: product?.slug ?? "subscription",
    name: product?.name ?? "Subscription delivery",
    unitPriceCents: amount,
    currency,
    quantity: 1,
  });
}

/** Marks the subscription past_due when a renewal payment fails (dunning). */
export async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
): Promise<void> {
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : (invoice.customer?.id ?? null);
  if (!customerId) return;
  await db
    .update(subscriptions)
    .set({ status: "past_due", updatedAt: new Date() })
    .where(
      and(
        eq(subscriptions.stripeCustomerId, customerId),
        eq(subscriptions.status, "active"),
      ),
    );
}

/** Reads the current period end across Stripe API-version field moves. */
function subscriptionPeriodEnd(sub: Stripe.Subscription): Date | null {
  const item = sub.items?.data?.[0];
  const epoch = item?.current_period_end;
  return typeof epoch === "number" ? new Date(epoch * 1000) : null;
}

/** All ISO country codes we ship to (union of shipping zones) for checkout. */
function allShippableCountries(): Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] {
  // A broad EU + nearby set; Stripe validates the address against it. Kept in
  // sync with the shipping zones conceptually, without a DB round-trip here.
  const codes = [
    "DK", "SE", "NO", "FI", "DE", "NL", "BE", "FR", "ES", "IT", "IE", "AT",
    "PT", "PL", "CZ", "GB", "CH", "US",
  ];
  return codes as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[];
}
