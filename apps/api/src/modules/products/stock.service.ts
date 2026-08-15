import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  admins,
  products,
  stockMovements,
  type StockMovement,
} from "../../db/schema";

/**
 * Stock as a ledger.
 *
 * `products.stock` is the balance the shop sells against; this records how it
 * got there. The distinction matters the first time a physical count disagrees
 * with the system: with only a balance, the discrepancy can be overwritten but
 * never explained, and the same leak keeps happening.
 *
 * Every change goes through `moveStock`, which updates the balance and writes
 * the movement in one transaction — so the two cannot drift apart through a
 * partial failure.
 */

export const STOCK_REASONS = [
  /** Goods arrived from a supplier. */
  "received",
  /** Sold — written when an order is paid. */
  "sale",
  /** Came back from a customer, refund or cancellation. */
  "return",
  /** A physical count disagreed with the system. */
  "count",
  /** Broken, expired or otherwise unsellable. */
  "damaged",
  /** Anything else, explained in the note. */
  "adjustment",
] as const;

export type StockReason = (typeof STOCK_REASONS)[number];

/** Reasons an admin may pick directly; sales and returns are system-driven. */
export const MANUAL_STOCK_REASONS: StockReason[] = [
  "received",
  "count",
  "damaged",
  "adjustment",
];

export type MoveResult =
  | { ok: true; movement: StockMovement; stock: number }
  | { ok: false; status: 400 | 404; message: string };

export interface MoveInput {
  productId: string;
  /** Signed. Positive receives, negative removes. */
  delta: number;
  reason: StockReason;
  note?: string | null;
  orderId?: string | null;
  actor?: string | null;
}

/**
 * Applies a stock change and records it.
 *
 * The balance is computed in SQL (`stock + delta`) rather than read-then-write,
 * so two concurrent movements can't both read the same starting value and lose
 * one of the changes. Clamped at zero: a negative balance is never true of a
 * shelf, and allowing it would hide the underlying error behind a number that
 * looks precise.
 */
export async function moveStock(input: MoveInput): Promise<MoveResult> {
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    return {
      ok: false,
      status: 400,
      message: "A stock movement must be a non-zero whole number",
    };
  }

  const actor = input.actor ?? "system";
  let actorEmail: string | null = null;
  if (actor !== "system") {
    const [admin] = await db
      .select({ email: admins.email })
      .from(admins)
      .where(eq(admins.userId, actor))
      .limit(1);
    actorEmail = admin?.email ?? null;
  }

  try {
    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(products)
        .set({
          stock: sql`GREATEST(${products.stock} + ${input.delta}, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(products.id, input.productId))
        .returning({ stock: products.stock });

      if (!updated) {
        return { ok: false as const, status: 404 as const, message: "Product not found" };
      }

      const [movement] = await tx
        .insert(stockMovements)
        .values({
          productId: input.productId,
          delta: input.delta,
          balanceAfter: updated.stock,
          reason: input.reason,
          note: input.note ?? null,
          orderId: input.orderId ?? null,
          actor,
          actorEmail,
        })
        .returning();

      return { ok: true as const, movement: movement!, stock: updated.stock };
    });
  } catch (err) {
    console.error("Stock movement failed:", err);
    return { ok: false, status: 400, message: "Could not record the stock movement" };
  }
}

/** One product's movements, newest first — the order you read a ledger in. */
export async function listMovements(
  productId: string,
  limit = 50,
): Promise<StockMovement[]> {
  return db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.productId, productId))
    .orderBy(desc(stockMovements.createdAt))
    .limit(limit);
}

/**
 * Whether the ledger explains the balance.
 *
 * Movements recorded before the ledger existed, or a direct UPDATE against the
 * database, both show up as a difference here. Surfacing it is the point: an
 * unexplained balance is worth knowing about, and silently trusting either
 * number would defeat having a ledger at all.
 */
export async function reconcile(productId: string): Promise<{
  stock: number;
  ledgerTotal: number;
  unexplained: number;
}> {
  const [product] = await db
    .select({ stock: products.stock })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  const [sum] = await db
    .select({ total: sql<number>`coalesce(sum(${stockMovements.delta}), 0)` })
    .from(stockMovements)
    .where(eq(stockMovements.productId, productId));

  const stock = product?.stock ?? 0;
  const ledgerTotal = Number(sum?.total ?? 0);
  return { stock, ledgerTotal, unexplained: stock - ledgerTotal };
}
