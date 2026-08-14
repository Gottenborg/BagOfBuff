import { inArray, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "../../db";
import {
  invoices,
  orderEvents,
  orderItems,
  orders,
  refunds,
  subscriptions,
} from "../../db/schema";
import { recordOrderEvent } from "../orders/order-events.service";

/**
 * Data-subject rights (GDPR arts. 15, 17 and 20).
 *
 * The privacy policy promises access, portability and erasure. Both operations
 * key on the email address, matched case-insensitively — `Buyer@example.com`
 * and `buyer@example.com` are the same person, and treating them as two would
 * quietly return half an answer to a legal request.
 */

/** Email match that treats case as insignificant, as email itself does. */
function sameEmail(column: AnyPgColumn, email: string) {
  return sql`lower(${column}) = lower(${email})`;
}

/**
 * Everything held about one person (arts. 15 and 20).
 *
 * Returned as structured JSON rather than prose: art. 20 requires a
 * "commonly used, machine-readable format", and the same payload then serves
 * both the access request and the portability one.
 */
export async function exportCustomerData(email: string) {
  const customerOrders = await db
    .select()
    .from(orders)
    .where(sameEmail(orders.email, email));

  const ids = customerOrders.map((o) => o.id);
  const [items, customerRefunds, events, customerInvoices, subs] =
    await Promise.all([
      ids.length
        ? db.select().from(orderItems).where(inArray(orderItems.orderId, ids))
        : [],
      ids.length
        ? db.select().from(refunds).where(inArray(refunds.orderId, ids))
        : [],
      ids.length
        ? db.select().from(orderEvents).where(inArray(orderEvents.orderId, ids))
        : [],
      ids.length
        ? db.select().from(invoices).where(inArray(invoices.orderId, ids))
        : [],
      db.select().from(subscriptions).where(sameEmail(subscriptions.email, email)),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    email,
    // Named so a recipient can tell what each section is without our help.
    orders: customerOrders.map((o) => ({
      ...o,
      items: items.filter((i) => i.orderId === o.id),
      refunds: customerRefunds.filter((r) => r.orderId === o.id),
      history: events
        .filter((e) => e.orderId === o.id)
        .map((e) => ({
          type: e.type,
          message: e.message,
          createdAt: e.createdAt,
        })),
      invoice: customerInvoices.find((inv) => inv.orderId === o.id) ?? null,
    })),
    subscriptions: subs,
    note:
      "Payment card details are held by Stripe and never reach Bag of Buff's systems. " +
      "Request them from Stripe directly if required.",
  };
}

export type EraseResult =
  | { ok: true; ordersAnonymized: number; subscriptionsAnonymized: number }
  | { ok: false; status: 404 | 409; message: string };

/**
 * Erasure (art. 17), implemented as anonymisation rather than deletion.
 *
 * Deleting the orders is the obvious reading and the wrong one: Danish
 * bookkeeping law requires sales documentation to be retained for five years,
 * and art. 17(3)(b) exempts processing required by law from the right to
 * erasure. So the personal data goes and the financial record stays — amounts,
 * VAT, dates and invoice numbers are untouched, while the name, address and
 * email are overwritten in place.
 *
 * Overwritten, not blanked: a null would be indistinguishable from an order
 * that never had an address, and someone would eventually "fix" it.
 */
export async function eraseCustomer(input: {
  email: string;
  actor?: string | null;
}): Promise<EraseResult> {
  const customerOrders = await db
    .select()
    .from(orders)
    .where(sameEmail(orders.email, input.email));

  const subs = await db
    .select()
    .from(subscriptions)
    .where(sameEmail(subscriptions.email, input.email));

  if (customerOrders.length === 0 && subs.length === 0) {
    return { ok: false, status: 404, message: "No data found for that email" };
  }

  // An active subscription is an ongoing contract; erasing its contact details
  // would leave us billing someone we can no longer identify or reach.
  const active = subs.filter(
    (s) => s.status === "active" || s.status === "trialing" || s.status === "past_due",
  );
  if (active.length > 0) {
    return {
      ok: false,
      status: 409,
      message:
        "This customer has an active subscription. Cancel it first — erasing now would leave a contract we cannot identify or contact.",
    };
  }

  const redacted = "[erased]";
  const ids = customerOrders.map((o) => o.id);

  if (ids.length > 0) {
    await db
      .update(orders)
      .set({
        email: null,
        shipName: redacted,
        shipLine1: redacted,
        shipLine2: null,
        shipCity: redacted,
        shipPostalCode: redacted,
        // Country stays: it carries no identity but decides the VAT treatment,
        // and removing it would corrupt the tax record we are obliged to keep.
        updatedAt: new Date(),
      })
      .where(inArray(orders.id, ids));

    for (const id of ids) {
      await recordOrderEvent({
        orderId: id,
        type: "customer.erased",
        actor: input.actor ?? null,
        message:
          "Personal data erased on request (GDPR art. 17). Financial records retained under bookkeeping law.",
      });
    }
  }

  if (subs.length > 0) {
    await db
      .update(subscriptions)
      .set({
        email: null,
        shipName: redacted,
        shipLine1: redacted,
        shipLine2: null,
        shipCity: redacted,
        shipPostalCode: redacted,
        updatedAt: new Date(),
      })
      .where(
        inArray(
          subscriptions.id,
          subs.map((s) => s.id),
        ),
      );
  }

  return {
    ok: true,
    ordersAnonymized: ids.length,
    subscriptionsAnonymized: subs.length,
  };
}

/** True once nothing identifying remains, so the UI can show erased customers. */
export function isErased(order: { email: string | null; shipName: string | null }) {
  return order.email === null && order.shipName === "[erased]";
}
