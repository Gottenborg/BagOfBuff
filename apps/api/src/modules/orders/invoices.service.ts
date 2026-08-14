import { eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { invoices, orders, type Invoice, type Order } from "../../db/schema";
import { env } from "../../lib/env";
import { recordOrderEvent } from "./order-events.service";

/**
 * Invoice issuing.
 *
 * Danish bookkeeping law requires an unbroken, sequential invoice series and
 * five-year retention of the documentation. That has two consequences the code
 * has to respect:
 *
 *  1. The number cannot be derived from the order id, the created date, or a
 *     filtered count of orders — all of those produce gaps, and a gap is what
 *     an auditor asks about.
 *  2. Issuing must be idempotent. Pressing "print invoice" twice is not two
 *     sales, and burning a number per click creates the gaps we just ruled out.
 */

export interface Seller {
  name: string;
  address: string;
  cvr: string;
  email: string;
  vatNumber: string;
}

/**
 * Who is selling, from configuration.
 *
 * An invoice without a CVR number is not a valid Danish invoice, so the
 * placeholders are deliberately obvious rather than plausible — a document that
 * looks complete but isn't is worse than one that visibly needs filling in.
 */
export function seller(): Seller {
  return {
    name: env.COMPANY_NAME,
    address: env.COMPANY_ADDRESS,
    cvr: env.COMPANY_CVR,
    email: env.COMPANY_EMAIL,
    vatNumber: env.COMPANY_CVR ? `DK${env.COMPANY_CVR.replace(/\D/g, "")}` : "",
  };
}

/** True when the seller details are real enough to issue against. */
export function sellerConfigured(): boolean {
  const s = seller();
  return Boolean(s.name && s.address && s.cvr);
}

export type IssueResult =
  | { ok: true; invoice: Invoice; alreadyIssued: boolean }
  | { ok: false; status: 404 | 409 | 503; message: string };

/**
 * Issues the invoice for an order, or returns the one already issued.
 *
 * The number is allocated under a transaction-scoped advisory lock rather than
 * a Postgres sequence: a sequence keeps counting through a rolled-back
 * transaction, which leaves exactly the gap the law objects to. Holding the
 * lock means concurrent issues queue rather than collide, and a failure rolls
 * the number back for the next caller to take.
 */
export async function issueInvoice(input: {
  orderId: string;
  actor?: string | null;
}): Promise<IssueResult> {
  if (!sellerConfigured()) {
    return {
      ok: false,
      status: 503,
      message:
        "Company details are not configured (COMPANY_NAME, COMPANY_ADDRESS, COMPANY_CVR). An invoice without a CVR number is not valid.",
    };
  }

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, input.orderId))
    .limit(1);
  if (!order) return { ok: false, status: 404, message: "Order not found" };

  if (order.status !== "paid" && order.status !== "fulfilled" && order.status !== "refunded") {
    return {
      ok: false,
      status: 409,
      message: "Only a paid order can be invoiced",
    };
  }

  const existing = await findInvoice(order.id);
  if (existing) return { ok: true, invoice: existing, alreadyIssued: true };

  const issued = await db.transaction(async (tx) => {
    // Serialize allocation across concurrent issues. The key is arbitrary but
    // fixed; it only has to be the same for every invoice allocation.
    await tx.execute(sql`select pg_advisory_xact_lock(4815162342)`);

    // Re-check inside the lock: two clicks can both pass the check above.
    const [already] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.orderId, order.id))
      .limit(1);
    if (already) return already;

    const [max] = await tx
      .select({ n: sql<number>`coalesce(max(${invoices.number}), 0)` })
      .from(invoices);

    const [created] = await tx
      .insert(invoices)
      .values({
        number: Number(max?.n ?? 0) + 1,
        orderId: order.id,
        sellerSnapshot: seller(),
        currency: order.currency,
        subtotalCents: order.subtotalCents,
        shippingCents: order.shippingCents,
        taxCents: order.taxCents ?? 0,
        totalCents: order.totalCents ?? order.subtotalCents,
        createdBy: input.actor ?? null,
      })
      .returning();
    return created!;
  });

  await recordOrderEvent({
    orderId: order.id,
    type: "invoice.issued",
    actor: input.actor ?? null,
    message: `Invoice ${formatInvoiceNumber(issued.number)} issued`,
    data: { number: issued.number, totalCents: issued.totalCents },
  });

  return { ok: true, invoice: issued, alreadyIssued: false };
}

export async function findInvoice(orderId: string): Promise<Invoice | null> {
  const [row] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.orderId, orderId))
    .limit(1);
  return row ?? null;
}

/** Zero-padded so invoices sort and read consistently on paper. */
export function formatInvoiceNumber(n: number): string {
  return String(n).padStart(5, "0");
}

/** Everything a document needs about an order, in one shape. */
export function invoiceView(order: Order, invoice: Invoice) {
  return {
    number: formatInvoiceNumber(invoice.number),
    issuedAt: invoice.issuedAt.toISOString(),
    seller: (invoice.sellerSnapshot as Seller | null) ?? seller(),
    currency: invoice.currency,
    subtotalCents: invoice.subtotalCents,
    shippingCents: invoice.shippingCents,
    taxCents: invoice.taxCents,
    totalCents: invoice.totalCents,
    orderId: order.id,
  };
}
