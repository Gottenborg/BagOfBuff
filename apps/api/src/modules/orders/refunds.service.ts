import type Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { recordOrderEvent } from "./order-events.service";
import { moveStock } from "../products/stock.service";
import {
  orderItems,
  orders,
  products,
  refunds,
  type Order,
  type Refund,
} from "../../db/schema";
import { getStripe } from "../../lib/stripe";

/**
 * Reasons a refund is issued. `requested_by_customer` covers the statutory
 * 14-day right of withdrawal, which is the common case for a webshop.
 */
export const REFUND_REASONS = [
  "requested_by_customer",
  "duplicate",
  "fraudulent",
] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

export interface RefundInput {
  orderId: string;
  /** Omitted means refund everything still outstanding. */
  amountCents?: number | null;
  reason?: RefundReason;
  note?: string | null;
  /** Supabase user id of the admin issuing it. */
  createdBy?: string | null;
  /** Put the goods back into sellable stock. */
  restock?: boolean;
}

export type RefundResult =
  | { ok: true; refund: Refund; refundedTotalCents: number }
  | { ok: false; status: 400 | 404 | 409 | 503; message: string };

/** Sum of refunds that have not failed, in minor units. */
export async function refundedTotal(orderId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${refunds.amountCents}) filter (where ${refunds.status} <> 'failed'), 0)`,
    })
    .from(refunds)
    .where(eq(refunds.orderId, orderId));
  return Number(row?.total ?? 0);
}

export function listRefunds(orderId: string): Promise<Refund[]> {
  return db.select().from(refunds).where(eq(refunds.orderId, orderId));
}

/**
 * Refunds an order through Stripe and records it.
 *
 * Guards, in order, because each failure mode is a different mistake:
 * the order must exist, must have been paid (there is nothing to send back
 * otherwise), must have a payment to reverse, and the amount must be positive
 * and within what is still outstanding. Refunding more than was captured is the
 * expensive error, so the remaining balance is computed from recorded refunds
 * rather than trusting the caller.
 */
export async function refundOrder(input: RefundInput): Promise<RefundResult> {
  const stripe = getStripe();
  if (!stripe) {
    return { ok: false, status: 503, message: "Refunds are not configured" };
  }

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, input.orderId))
    .limit(1);
  if (!order) return { ok: false, status: 404, message: "Order not found" };

  if (order.status !== "paid" && order.status !== "fulfilled") {
    return {
      ok: false,
      status: 409,
      message: `Cannot refund an order that is ${order.status}`,
    };
  }
  if (!order.stripePaymentIntentId) {
    return {
      ok: false,
      status: 409,
      message: "This order has no captured payment to refund",
    };
  }

  const captured = order.totalCents ?? 0;
  const already = await refundedTotal(order.id);
  const outstanding = captured - already;
  if (outstanding <= 0) {
    return { ok: false, status: 409, message: "Order is already fully refunded" };
  }

  const amountCents = input.amountCents ?? outstanding;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { ok: false, status: 400, message: "Refund amount must be positive" };
  }
  if (amountCents > outstanding) {
    return {
      ok: false,
      status: 409,
      message: `Refund exceeds the ${(outstanding / 100).toFixed(2)} ${order.currency} still outstanding`,
    };
  }

  // Record first, so a Stripe call that succeeds but whose response we lose
  // still leaves a trace to reconcile against.
  const [pending] = await db
    .insert(refunds)
    .values({
      orderId: order.id,
      amountCents,
      currency: order.currency,
      reason: input.reason ?? "requested_by_customer",
      note: input.note ?? null,
      status: "pending",
      createdBy: input.createdBy ?? null,
    })
    .returning();

  let stripeRefund: Stripe.Refund;
  try {
    stripeRefund = await stripe.refunds.create(
      {
        payment_intent: order.stripePaymentIntentId,
        amount: amountCents,
        reason: input.reason ?? "requested_by_customer",
        metadata: { orderId: order.id, refundId: pending!.id },
      },
      // Retrying this request must not refund twice.
      { idempotencyKey: `refund_${pending!.id}` },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(refunds)
      .set({ status: "failed", note: `${input.note ?? ""} [${message}]`.trim() })
      .where(eq(refunds.id, pending!.id));
    await recordOrderEvent({
      orderId: order.id,
      type: "refund.failed",
      actor: input.createdBy ?? null,
      message: `Refund of ${(amountCents / 100).toFixed(2)} ${order.currency} was refused by Stripe: ${message}`,
      data: { amountCents, currency: order.currency, refundId: pending!.id },
    });
    return { ok: false, status: 409, message: `Stripe refused the refund: ${message}` };
  }

  const [recorded] = await db
    .update(refunds)
    .set({
      stripeRefundId: stripeRefund.id,
      // Stripe reports `pending` for methods that settle asynchronously; the
      // webhook advances it.
      status: stripeRefund.status === "succeeded" ? "succeeded" : "pending",
    })
    .where(eq(refunds.id, pending!.id))
    .returning();

  const newTotal = already + amountCents;
  await applyRefundToOrder(order, newTotal, input.restock ?? false);

  const settled = recorded!.status === "succeeded";
  await recordOrderEvent({
    orderId: order.id,
    type: settled ? "refund.settled" : "refund.requested",
    actor: input.createdBy ?? null,
    message:
      `Refunded ${(amountCents / 100).toFixed(2)} ${order.currency}` +
      ` (${input.reason ?? "requested_by_customer"})` +
      (settled ? "" : " — pending settlement with Stripe") +
      (input.restock ? ", stock returned" : ""),
    data: {
      amountCents,
      currency: order.currency,
      reason: input.reason ?? "requested_by_customer",
      note: input.note ?? null,
      restocked: input.restock ?? false,
      refundedTotalCents: newTotal,
      stripeRefundId: recorded!.stripeRefundId,
    },
  });

  return { ok: true, refund: recorded!, refundedTotalCents: newTotal };
}

/**
 * Reflects a refund on the order itself: a full refund cancels it, a partial one
 * leaves it paid. Optionally returns the goods to stock — off by default,
 * because a refund under the right of withdrawal does not always mean the item
 * came back in sellable condition.
 */
async function applyRefundToOrder(
  order: Order,
  refundedTotalCents: number,
  restock: boolean,
) {
  const captured = order.totalCents ?? 0;
  const fullyRefunded = captured > 0 && refundedTotalCents >= captured;

  if (fullyRefunded) {
    await db
      .update(orders)
      .set({ status: "refunded", updatedAt: new Date() })
      .where(eq(orders.id, order.id));
  } else {
    await db
      .update(orders)
      .set({ updatedAt: new Date() })
      .where(eq(orders.id, order.id));
  }

  if (restock) {
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    for (const item of items) {
      if (!item.productId) continue;
      await moveStock({
        productId: item.productId,
        delta: item.quantity,
        reason: "return",
        orderId: order.id,
        note: item.name,
      });
    }
  }
}

/**
 * Mirrors Stripe's own refund events, so refunds issued from the Stripe
 * dashboard (or ones that settle later) show up here too. Idempotent on the
 * Stripe refund id.
 */
export async function syncRefundFromStripe(
  stripeRefund: Stripe.Refund,
): Promise<void> {
  const status =
    stripeRefund.status === "succeeded"
      ? "succeeded"
      : stripeRefund.status === "failed" || stripeRefund.status === "canceled"
        ? "failed"
        : "pending";

  const [existing] = await db
    .select()
    .from(refunds)
    .where(eq(refunds.stripeRefundId, stripeRefund.id))
    .limit(1);

  if (existing) {
    // Only a real transition is history; Stripe redelivers the same event.
    if (existing.status !== status) {
      await db.update(refunds).set({ status }).where(eq(refunds.id, existing.id));
      await recordOrderEvent({
        orderId: existing.orderId,
        type: status === "failed" ? "refund.failed" : "refund.settled",
        actor: "stripe",
        message: `Refund of ${(existing.amountCents / 100).toFixed(2)} ${existing.currency} ${status === "succeeded" ? "settled" : status}`,
        data: { from: existing.status, to: status, stripeRefundId: stripeRefund.id },
      });
    }
    return;
  }

  // Issued outside the back office: attach it to the order via metadata, or by
  // the payment intent when Stripe didn't carry our metadata.
  const orderId = stripeRefund.metadata?.orderId;
  const [order] = orderId
    ? await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
    : typeof stripeRefund.payment_intent === "string"
      ? await db
          .select()
          .from(orders)
          .where(eq(orders.stripePaymentIntentId, stripeRefund.payment_intent))
          .limit(1)
      : [];
  if (!order) return;

  await db.insert(refunds).values({
    orderId: order.id,
    stripeRefundId: stripeRefund.id,
    amountCents: stripeRefund.amount,
    currency: (stripeRefund.currency ?? order.currency).toUpperCase(),
    reason: "requested_by_customer",
    note: "Issued in Stripe",
    status,
  });

  await recordOrderEvent({
    orderId: order.id,
    type: status === "failed" ? "refund.failed" : "refund.settled",
    actor: "stripe",
    message: `Refund of ${(stripeRefund.amount / 100).toFixed(2)} ${(stripeRefund.currency ?? order.currency).toUpperCase()} issued in the Stripe dashboard`,
    data: { amountCents: stripeRefund.amount, status, stripeRefundId: stripeRefund.id },
  });

  const total = await refundedTotal(order.id);
  await applyRefundToOrder(order, total, false);
}
