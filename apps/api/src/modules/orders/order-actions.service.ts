import { eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { orderItems, orders, products, type Order } from "../../db/schema";
import { isEmailConfigured, sendOrderConfirmation } from "../../lib/email";
import { recordOrderEvent } from "./order-events.service";
import { refundOrder, refundedTotal } from "./refunds.service";
import { moveStock } from "../products/stock.service";

/**
 * Order actions that aren't fulfillment or refunding: cancelling, and sending
 * the confirmation email again.
 */

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; status: 400 | 404 | 409 | 503; message: string };

export interface CancelInput {
  orderId: string;
  /** Refund whatever has been captured. Meaningless on an unpaid order. */
  refund: boolean;
  /** Return the goods to sellable stock. */
  restock: boolean;
  reason?: string | null;
  actor?: string | null;
}

/**
 * Cancels an order.
 *
 * "Cancel" and "refund" are different acts and conflating them loses
 * information: a customer who changes their mind before the parcel leaves needs
 * the order stopped *and* their money back, while an unpaid abandoned checkout
 * needs only the former. Refunding is therefore a choice here, and the order
 * ends up canceled either way.
 *
 * Refuses once the goods have shipped — at that point the correct path is a
 * return under the right of withdrawal, which is a refund against a real
 * shipment, not a cancellation.
 */
export async function cancelOrder(input: CancelInput): Promise<ActionResult> {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, input.orderId))
    .limit(1);
  if (!order) return { ok: false, status: 404, message: "Order not found" };

  if (order.status === "canceled") {
    return { ok: false, status: 409, message: "This order is already canceled" };
  }
  if (order.fulfillmentStatus === "shipped") {
    return {
      ok: false,
      status: 409,
      message:
        "This order has shipped. Refund it as a return instead of cancelling.",
    };
  }

  const captured = order.totalCents ?? 0;
  const paid = order.status === "paid" || order.status === "fulfilled";

  // Refund first: if the money can't be returned we must not leave a canceled
  // order that was silently never refunded.
  if (input.refund && paid) {
    const already = await refundedTotal(order.id);
    const outstanding = captured - already;
    if (outstanding > 0) {
      const result = await refundOrder({
        orderId: order.id,
        amountCents: outstanding,
        reason: "requested_by_customer",
        note: input.reason ? `Cancelled: ${input.reason}` : "Order cancelled",
        restock: input.restock,
        createdBy: input.actor ?? null,
      });
      if (!result.ok) return result;
    }
  } else if (input.restock && paid) {
    // Restocking normally rides along with the refund; do it here when
    // cancelling without one.
    await restockOrder(order);
  }

  await db
    .update(orders)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(eq(orders.id, order.id));

  await recordOrderEvent({
    orderId: order.id,
    type: "order.canceled",
    actor: input.actor ?? null,
    message:
      `Order canceled${input.reason ? `: ${input.reason}` : ""}` +
      (input.refund && paid ? " — payment refunded" : "") +
      (input.restock ? ", stock returned" : ""),
    data: { refunded: input.refund && paid, restocked: input.restock },
  });

  return { ok: true, message: "Order canceled" };
}

/** Returns an order's items to sellable stock. */
async function restockOrder(order: Order): Promise<void> {
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

/**
 * Sends the order confirmation again.
 *
 * "I never got a confirmation" is among the most common support messages, and
 * the causes are mundane — spam folder, a typo'd address, or email simply not
 * being configured when the order was placed. Optionally corrects the address
 * on the order at the same time, since a resend to the same wrong address helps
 * nobody.
 */
export async function resendConfirmation(input: {
  orderId: string;
  email?: string | null;
  actor?: string | null;
}): Promise<ActionResult> {
  if (!isEmailConfigured()) {
    return {
      ok: false,
      status: 503,
      message:
        "Email is not configured (RESEND_API_KEY is unset), so nothing would be sent.",
    };
  }

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, input.orderId))
    .limit(1);
  if (!order) return { ok: false, status: 404, message: "Order not found" };

  const to = input.email?.trim() || order.email;
  if (!to) {
    return {
      ok: false,
      status: 400,
      message: "This order has no email address. Add one and try again.",
    };
  }

  // Correcting the address is part of the fix when the original was wrong.
  let current = order;
  if (to !== order.email) {
    const [updated] = await db
      .update(orders)
      .set({ email: to, updatedAt: new Date() })
      .where(eq(orders.id, order.id))
      .returning();
    current = updated!;
    await recordOrderEvent({
      orderId: order.id,
      type: "order.email_changed",
      actor: input.actor ?? null,
      message: `Email address corrected from ${order.email ?? "(none)"} to ${to}`,
      data: { from: order.email, to },
    });
  }

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));
  const sent = await sendOrderConfirmation(current, items);

  await recordOrderEvent({
    orderId: order.id,
    type: sent ? "email.sent" : "email.failed",
    actor: input.actor ?? null,
    message: sent
      ? `Order confirmation re-sent to ${to}`
      : `Order confirmation to ${to} was rejected by the email provider`,
    data: { to, resend: true },
  });

  if (!sent) {
    return {
      ok: false,
      status: 503,
      message: "The email provider rejected the message. See the order history.",
    };
  }
  return { ok: true, message: `Confirmation sent to ${to}` };
}
