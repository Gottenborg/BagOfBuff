import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { orderItems, orders } from "../../db/schema";
import { env } from "../../lib/env";
import { getStripe } from "../../lib/stripe";
import {
  createCheckoutSession,
  expireCheckoutSession,
  fulfillCheckoutSession,
} from "./checkout.service";
import {
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionCheckoutCompleted,
  syncSubscription,
} from "../subscriptions/subscriptions.service";

const Message = t.Object({ message: t.String() });
const Int = t.Number();

const CreateSessionBody = t.Object({
  items: t.Array(
    t.Object({
      slug: t.String({ minLength: 1 }),
      quantity: t.Integer({ minimum: 1 }),
    }),
    { minItems: 1 },
  ),
  country: t.String({ minLength: 2, maxLength: 2 }),
  shippingRateId: t.String({ minLength: 1 }),
  email: t.Optional(t.Nullable(t.String({ format: "email" }))),
});

const CreateSessionResponse = t.Object({
  url: t.String(),
  sessionId: t.String(),
  orderId: t.String(),
});

const OrderItemModel = t.Object({
  slug: t.String(),
  name: t.String(),
  unitPriceCents: Int,
  currency: t.String(),
  quantity: Int,
});

const OrderModel = t.Object({
  id: t.String(),
  status: t.String(),
  currency: t.String(),
  subtotalCents: Int,
  shippingCents: Int,
  taxCents: t.Nullable(Int),
  totalCents: t.Nullable(Int),
  email: t.Nullable(t.String()),
  items: t.Array(OrderItemModel),
});

export const checkoutRoutes = new Elysia({
  prefix: "/checkout",
  tags: ["Checkout"],
})
  // --- Create a hosted Stripe Checkout session ---------------------------
  .post(
    "/session",
    async ({ body, status }) => {
      const result = await createCheckoutSession({
        items: body.items,
        country: body.country,
        shippingRateId: body.shippingRateId,
        email: body.email ?? null,
      });
      if (!result.ok) return status(result.status, { message: result.message });
      return {
        url: result.url,
        sessionId: result.sessionId,
        orderId: result.orderId,
      };
    },
    {
      body: CreateSessionBody,
      response: {
        200: CreateSessionResponse,
        400: Message,
        404: Message,
        409: Message,
        503: Message,
      },
      detail: {
        summary: "Start a Stripe Checkout session for a cart",
        description:
          "Validates the cart against the catalogue, applies shipping, and returns a hosted Stripe Checkout URL. Prices are server-authoritative.",
      },
    },
  )
  // --- Stripe webhook: source of truth for order state -------------------
  .post(
    "/webhook",
    async ({ body, headers, status }) => {
      const stripe = getStripe();
      if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
        return status(503, { message: "Webhooks are not configured" });
      }
      const signature = headers["stripe-signature"];
      if (!signature) {
        return status(400, { message: "Missing stripe-signature header" });
      }

      let event: Stripe.Event;
      try {
        event = await stripe.webhooks.constructEventAsync(
          // Raw request body string (see `parse` below) — required so the
          // signature check runs over the exact bytes Stripe signed.
          typeof body === "string" ? body : JSON.stringify(body),
          signature,
          env.STRIPE_WEBHOOK_SECRET,
        );
      } catch (err) {
        console.error("Stripe webhook signature verification failed:", err);
        return status(400, { message: "Invalid signature" });
      }

      switch (event.type) {
        case "checkout.session.completed":
          // One-time payments fulfill an order; subscription-mode sessions
          // create the local subscription (cycles are handled by invoice.paid).
          if (event.data.object.mode === "subscription") {
            await handleSubscriptionCheckoutCompleted(event.data.object);
          } else {
            await fulfillCheckoutSession(event.data.object);
          }
          break;
        case "checkout.session.expired":
          await expireCheckoutSession(event.data.object);
          break;
        case "invoice.paid":
          // Each paid subscription cycle spawns a fulfillment order.
          await handleInvoicePaid(event.data.object);
          break;
        case "invoice.payment_failed":
          await handleInvoicePaymentFailed(event.data.object);
          break;
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
          await syncSubscription(event.data.object);
          break;
        default:
          // Unhandled event types are acknowledged so Stripe stops retrying.
          break;
      }

      return { received: true };
    },
    {
      // Preserve the raw body for signature verification; Stripe signs the
      // exact bytes, so we must not let Elysia JSON-parse and re-stringify.
      parse: ({ request }) => request.text(),
      response: {
        200: t.Object({ received: t.Boolean() }),
        400: Message,
        503: Message,
      },
      detail: {
        summary: "Stripe webhook (checkout completion → order fulfillment)",
      },
    },
  )
  // --- Order lookup for the confirmation page ----------------------------
  .get(
    "/orders/:id",
    async ({ params, status }) => {
      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, params.id))
        .limit(1);
      if (!order) return status(404, { message: "Order not found" });
      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));
      return {
        id: order.id,
        status: order.status,
        currency: order.currency,
        subtotalCents: order.subtotalCents,
        shippingCents: order.shippingCents,
        taxCents: order.taxCents,
        totalCents: order.totalCents,
        email: order.email,
        items: items.map((i) => ({
          slug: i.slug,
          name: i.name,
          unitPriceCents: i.unitPriceCents,
          currency: i.currency,
          quantity: i.quantity,
        })),
      };
    },
    {
      params: t.Object({ id: t.String() }),
      response: { 200: OrderModel, 404: Message },
      detail: {
        summary: "Get an order by id (for the checkout confirmation page)",
      },
    },
  );
