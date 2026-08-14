import { asc, eq } from "drizzle-orm";
import { db } from "../../db";
import { admins, orderEvents, type OrderEvent } from "../../db/schema";

/**
 * The order's history.
 *
 * Several actors change an order — the buyer, Stripe's webhooks, and whoever is
 * in the back office — and the order row only shows the latest state. "Why was
 * this refunded twice?" and "did anyone actually mark it shipped?" are
 * unanswerable from the row alone. Each change appends a line here instead.
 *
 * Recording must never break the thing it is recording: a failed write is
 * logged and swallowed, because losing a history line is a far smaller problem
 * than failing a payment webhook or leaving a refund half-applied.
 */

export const ORDER_EVENT_TYPES = [
  "order.created",
  "order.paid",
  "order.expired",
  "order.canceled",
  "order.email_changed",
  "fulfillment.changed",
  "tracking.changed",
  "refund.requested",
  "refund.settled",
  "refund.failed",
  "invoice.issued",
  "customer.erased",
  "email.sent",
  "email.failed",
] as const;

export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];

/** Non-admin actors, distinguishable from an admin's user id. */
export type SystemActor = "stripe" | "customer" | "system";

export interface RecordEventInput {
  orderId: string;
  type: OrderEventType;
  /** Written now, in past tense, so it never has to be re-derived from data. */
  message: string;
  /** An admin user id, or one of the system actors. */
  actor?: string | SystemActor | null;
  /** Structured detail for anything the message leaves out. */
  data?: Record<string, unknown> | null;
}

export async function recordOrderEvent(input: RecordEventInput): Promise<void> {
  try {
    const actor = input.actor ?? "system";
    // Resolve an admin id to an email once, at write time: staff come and go,
    // and a log that says "user 8f3a…" a year later is not a history.
    let actorEmail: string | null = null;
    if (actor !== "stripe" && actor !== "customer" && actor !== "system") {
      const [admin] = await db
        .select({ email: admins.email })
        .from(admins)
        .where(eq(admins.userId, actor))
        .limit(1);
      actorEmail = admin?.email ?? null;
    }

    await db.insert(orderEvents).values({
      orderId: input.orderId,
      type: input.type,
      message: input.message,
      actor,
      actorEmail,
      data: input.data ?? null,
    });
  } catch (err) {
    // Deliberately swallowed — see the note at the top of this file.
    console.error(
      `Failed to record order event ${input.type} for ${input.orderId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/** One order's history, oldest first — the order things actually happened in. */
export async function listOrderEvents(orderId: string): Promise<OrderEvent[]> {
  return db
    .select()
    .from(orderEvents)
    .where(eq(orderEvents.orderId, orderId))
    .orderBy(asc(orderEvents.createdAt));
}
