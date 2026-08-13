import { count, desc, eq, inArray, ne } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { orderItems, orders, type Order, type OrderItem } from "../../db/schema";
import { authPlugin, isAdmin } from "../auth/auth.plugin";
import {
  REFUND_REASONS,
  listRefunds,
  refundOrder,
} from "./refunds.service";

const Unauthorized = t.Object({ message: t.String() });
const Forbidden = t.Object({ message: t.String() });
const NotFound = t.Object({ message: t.String() });
const Int = t.Number();

/** Fulfillment workflow states, in order. */
const FULFILLMENT_STATES = ["new", "packed", "shipped"] as const;
const FulfillmentStatus = t.Union(
  FULFILLMENT_STATES.map((s) => t.Literal(s)),
);

const OrderSummary = t.Object({
  id: t.String(),
  status: t.String(),
  fulfillmentStatus: t.String(),
  email: t.Nullable(t.String()),
  currency: t.String(),
  totalCents: t.Nullable(Int),
  itemCount: Int,
  shipCountry: t.Nullable(t.String()),
  shippingRateName: t.Nullable(t.String()),
  trackingNumber: t.Nullable(t.String()),
  createdAt: t.String({ format: "date-time" }),
  paidAt: t.Nullable(t.String({ format: "date-time" })),
});

const OrderItemModel = t.Object({
  id: t.String(),
  slug: t.String(),
  name: t.String(),
  unitPriceCents: Int,
  currency: t.String(),
  quantity: Int,
});

const RefundModel = t.Object({
  id: t.String(),
  amountCents: Int,
  currency: t.String(),
  reason: t.String(),
  note: t.Nullable(t.String()),
  status: t.String(),
  createdAt: t.String({ format: "date-time" }),
});

const OrderDetail = t.Object({
  id: t.String(),
  status: t.String(),
  fulfillmentStatus: t.String(),
  email: t.Nullable(t.String()),
  currency: t.String(),
  subtotalCents: Int,
  shippingCents: Int,
  taxCents: t.Nullable(Int),
  totalCents: t.Nullable(Int),
  shippingRateName: t.Nullable(t.String()),
  trackingCarrier: t.Nullable(t.String()),
  trackingNumber: t.Nullable(t.String()),
  ship: t.Object({
    name: t.Nullable(t.String()),
    line1: t.Nullable(t.String()),
    line2: t.Nullable(t.String()),
    city: t.Nullable(t.String()),
    postalCode: t.Nullable(t.String()),
    country: t.Nullable(t.String()),
  }),
  items: t.Array(OrderItemModel),
  refunds: t.Array(RefundModel),
  /** Sum of non-failed refunds; equals totalCents when fully refunded. */
  refundedCents: Int,
  createdAt: t.String({ format: "date-time" }),
  paidAt: t.Nullable(t.String({ format: "date-time" })),
  shippedAt: t.Nullable(t.String({ format: "date-time" })),
});

const RefundBody = t.Object({
  /** Omit to refund everything still outstanding. */
  amountCents: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
  reason: t.Optional(t.Union(REFUND_REASONS.map((r) => t.Literal(r)))),
  note: t.Optional(t.Nullable(t.String())),
  /** Return the goods to sellable stock. */
  restock: t.Optional(t.Boolean()),
});

const UpdateFulfillmentBody = t.Object({
  fulfillmentStatus: t.Optional(FulfillmentStatus),
  trackingCarrier: t.Optional(t.Nullable(t.String())),
  trackingNumber: t.Optional(t.Nullable(t.String())),
});

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function serializeDetail(
  order: Order,
  items: OrderItem[],
  orderRefunds: { id: string; amountCents: number; currency: string; reason: string; note: string | null; status: string; createdAt: Date }[] = [],
) {
  return {
    id: order.id,
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    email: order.email,
    currency: order.currency,
    subtotalCents: order.subtotalCents,
    shippingCents: order.shippingCents,
    taxCents: order.taxCents,
    totalCents: order.totalCents,
    shippingRateName: order.shippingRateName,
    trackingCarrier: order.trackingCarrier,
    trackingNumber: order.trackingNumber,
    ship: {
      name: order.shipName,
      line1: order.shipLine1,
      line2: order.shipLine2,
      city: order.shipCity,
      postalCode: order.shipPostalCode,
      country: order.shipCountry,
    },
    items: items.map((i) => ({
      id: i.id,
      slug: i.slug,
      name: i.name,
      unitPriceCents: i.unitPriceCents,
      currency: i.currency,
      quantity: i.quantity,
    })),
    refunds: orderRefunds.map((r) => ({
      id: r.id,
      amountCents: r.amountCents,
      currency: r.currency,
      reason: r.reason,
      note: r.note,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
    refundedCents: orderRefunds
      .filter((r) => r.status !== "failed")
      .reduce((sum, r) => sum + r.amountCents, 0),
    createdAt: order.createdAt.toISOString(),
    paidAt: iso(order.paidAt),
    shippedAt: iso(order.shippedAt),
  };
}

export const ordersRoutes = new Elysia({
  prefix: "/admin/orders",
  tags: ["Orders (admin)"],
})
  .use(authPlugin)
  .get(
    "/",
    async ({ query }) => {
      // Default to actionable orders (paid); `status=all` includes pending
      // (abandoned) and canceled sessions.
      const rows =
        query.status === "all"
          ? await db.select().from(orders).orderBy(desc(orders.createdAt))
          : await db
              .select()
              .from(orders)
              .where(ne(orders.status, "pending"))
              .orderBy(desc(orders.createdAt));

      const ids = rows.map((o) => o.id);
      const counts = ids.length
        ? await db
            .select({ orderId: orderItems.orderId, n: count() })
            .from(orderItems)
            .where(inArray(orderItems.orderId, ids))
            .groupBy(orderItems.orderId)
        : [];
      const countBy = new Map(counts.map((c) => [c.orderId, Number(c.n)]));

      return rows.map((o) => ({
        id: o.id,
        status: o.status,
        fulfillmentStatus: o.fulfillmentStatus,
        email: o.email,
        currency: o.currency,
        totalCents: o.totalCents,
        itemCount: countBy.get(o.id) ?? 0,
        shipCountry: o.shipCountry,
        shippingRateName: o.shippingRateName,
        trackingNumber: o.trackingNumber,
        createdAt: o.createdAt.toISOString(),
        paidAt: iso(o.paidAt),
      }));
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      query: t.Object({
        status: t.Optional(t.Union([t.Literal("paid"), t.Literal("all")])),
      }),
      response: {
        200: t.Array(OrderSummary),
        401: Unauthorized,
        403: Forbidden,
      },
      detail: { summary: "List orders (admin)" },
    },
  )
  .get(
    "/:id",
    async ({ params, status }) => {
      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, params.id))
        .limit(1);
      if (!order) return status(404, { message: "Order not found" });
      const [items, orderRefunds] = await Promise.all([
        db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
        listRefunds(order.id),
      ]);
      return serializeDetail(order, items, orderRefunds);
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      params: t.Object({ id: t.String() }),
      response: {
        200: OrderDetail,
        401: Unauthorized,
        403: Forbidden,
        404: NotFound,
      },
      detail: { summary: "Get an order with its items (admin)" },
    },
  )
  // --- Refunds -------------------------------------------------------------
  .post(
    "/:id/refund",
    async ({ params, body, user, status }) => {
      const result = await refundOrder({
        orderId: params.id,
        amountCents: body.amountCents ?? null,
        reason: body.reason,
        note: body.note ?? null,
        restock: body.restock ?? false,
        createdBy: user?.id ?? null,
      });
      if (!result.ok) return status(result.status, { message: result.message });

      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, params.id))
        .limit(1);
      const [items, orderRefunds] = await Promise.all([
        db.select().from(orderItems).where(eq(orderItems.orderId, params.id)),
        listRefunds(params.id),
      ]);
      return serializeDetail(order!, items, orderRefunds);
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      params: t.Object({ id: t.String() }),
      body: RefundBody,
      response: {
        200: OrderDetail,
        400: NotFound,
        401: Unauthorized,
        403: Forbidden,
        404: NotFound,
        409: NotFound,
        503: NotFound,
      },
      detail: {
        summary: "Refund an order, fully or partially (admin)",
        description:
          "Refunds through Stripe and records it. Omit `amountCents` to refund everything still outstanding; the remaining balance is computed from recorded refunds, so an order can never be over-refunded.",
      },
    },
  )
  .patch(
    "/:id/fulfillment",
    async ({ params, body, status }) => {
      const [current] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, params.id))
        .limit(1);
      if (!current) return status(404, { message: "Order not found" });

      const nextStatus = body.fulfillmentStatus ?? current.fulfillmentStatus;
      const patch: Partial<Order> = {
        fulfillmentStatus: nextStatus,
        updatedAt: new Date(),
      };
      if (body.trackingCarrier !== undefined)
        patch.trackingCarrier = body.trackingCarrier;
      if (body.trackingNumber !== undefined)
        patch.trackingNumber = body.trackingNumber;
      // Stamp (or clear) the shipped time as the status crosses the "shipped"
      // boundary, so it always reflects the current state.
      if (nextStatus === "shipped" && current.fulfillmentStatus !== "shipped") {
        patch.shippedAt = new Date();
      } else if (nextStatus !== "shipped") {
        patch.shippedAt = null;
      }

      const [updated] = await db
        .update(orders)
        .set(patch)
        .where(eq(orders.id, params.id))
        .returning();
      const [items, orderRefunds] = await Promise.all([
        db.select().from(orderItems).where(eq(orderItems.orderId, updated!.id)),
        listRefunds(updated!.id),
      ]);
      return serializeDetail(updated!, items, orderRefunds);
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      params: t.Object({ id: t.String() }),
      body: UpdateFulfillmentBody,
      response: {
        200: OrderDetail,
        401: Unauthorized,
        403: Forbidden,
        404: NotFound,
      },
      detail: { summary: "Update fulfillment status / tracking (admin)" },
    },
  );
