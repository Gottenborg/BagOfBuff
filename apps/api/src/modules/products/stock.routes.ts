import { Elysia, t } from "elysia";
import { authPlugin, isAdmin } from "../auth/auth.plugin";
import {
  MANUAL_STOCK_REASONS,
  listMovements,
  moveStock,
  reconcile,
} from "./stock.service";

const Int = t.Number();

/**
 * Stock ledger routes.
 *
 * Mounted under their own prefix rather than on the products instance, whose
 * public lookup is `/:slug` — a second dynamic segment in the same position
 * cannot coexist with it.
 */
export const stockRoutes = new Elysia({
  prefix: "/admin/stock",
  tags: ["Stock (admin)"],
})
  .use(authPlugin)
  // --- Stock ledger ---------------------------------------------------------
  .get(
    "/:id",
    async ({ params }) => {
      const [movements, balance] = await Promise.all([
        listMovements(params.id),
        reconcile(params.id),
      ]);
      return {
        stock: balance.stock,
        ledgerTotal: balance.ledgerTotal,
        unexplained: balance.unexplained,
        movements: movements.map((m) => ({
          id: m.id,
          delta: m.delta,
          balanceAfter: m.balanceAfter,
          reason: m.reason,
          note: m.note,
          orderId: m.orderId,
          actor: m.actor,
          actorEmail: m.actorEmail,
          createdAt: m.createdAt.toISOString(),
        })),
      };
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({
          stock: Int,
          /** Sum of every recorded movement. */
          ledgerTotal: Int,
          /** stock - ledgerTotal: non-zero means something changed off-ledger. */
          unexplained: Int,
          movements: t.Array(
            t.Object({
              id: t.String(),
              delta: Int,
              balanceAfter: Int,
              reason: t.String(),
              note: t.Nullable(t.String()),
              orderId: t.Nullable(t.String()),
              actor: t.String(),
              actorEmail: t.Nullable(t.String()),
              createdAt: t.String({ format: "date-time" }),
            }),
          ),
        }),
        401: t.Object({ message: t.String() }),
        403: t.Object({ message: t.String() }),
      },
      detail: {
        summary: "Stock movements for a product (admin)",
        description:
          "Newest first, with a reconciliation: `unexplained` is non-zero when the balance was changed outside the ledger (a direct UPDATE, or movements predating it).",
      },
    },
  )
  .post(
    "/:id",
    async ({ params, body, user, status }) => {
      const result = await moveStock({
        productId: params.id,
        delta: body.delta,
        reason: body.reason,
        note: body.note ?? null,
        actor: user?.id ?? null,
      });
      if (!result.ok) return status(result.status, { message: result.message });
      return { stock: result.stock, delta: result.movement.delta };
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      params: t.Object({ id: t.String() }),
      body: t.Object({
        /** Signed and non-zero: positive receives, negative removes. */
        delta: t.Integer(),
        reason: t.Union(MANUAL_STOCK_REASONS.map((r) => t.Literal(r))),
        note: t.Optional(t.Nullable(t.String())),
      }),
      response: {
        200: t.Object({ stock: Int, delta: Int }),
        400: t.Object({ message: t.String() }),
        401: t.Object({ message: t.String() }),
        403: t.Object({ message: t.String() }),
        404: t.Object({ message: t.String() }),
      },
      detail: {
        summary: "Record a stock movement (admin)",
        description:
          "Receiving a delivery, correcting a count, or writing off damage. Sales and returns are recorded automatically by the order flow.",
      },
    },
  );
