import { and, count, desc, eq, ilike, inArray, ne, or } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import {
  orderItems,
  orders,
  type Invoice,
  type Order,
  type OrderEvent,
  type OrderItem,
} from "../../db/schema";
import { authPlugin, isAdmin } from "../auth/auth.plugin";
import {
  REFUND_REASONS,
  listRefunds,
  refundOrder,
} from "./refunds.service";
import { listOrderEvents, recordOrderEvent } from "./order-events.service";
import { cancelOrder, resendConfirmation } from "./order-actions.service";
import {
  findInvoice,
  formatInvoiceNumber,
  issueInvoice,
  seller,
  sellerConfigured,
} from "./invoices.service";

const Unauthorized = t.Object({ message: t.String() });
const Forbidden = t.Object({ message: t.String() });
const NotFound = t.Object({ message: t.String() });
const Message = t.Object({ message: t.String() });
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

const OrderEventModel = t.Object({
  id: t.String(),
  type: t.String(),
  message: t.String(),
  /** Admin user id, or "stripe" / "customer" / "system". */
  actor: t.String(),
  actorEmail: t.Nullable(t.String()),
  createdAt: t.String({ format: "date-time" }),
});

const SellerModel = t.Object({
  name: t.String(),
  address: t.String(),
  cvr: t.String(),
  email: t.String(),
  vatNumber: t.String(),
});

const InvoiceModel = t.Object({
  number: t.String(),
  issuedAt: t.String({ format: "date-time" }),
  seller: SellerModel,
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
  /** Append-only history, oldest first. */
  events: t.Array(OrderEventModel),
  /** Present once an invoice has been issued for this order. */
  invoice: t.Nullable(InvoiceModel),
  /** The seller identity documents are printed with, for the packing slip. */
  seller: SellerModel,
  /** False when company details are unset, so the UI can say why. */
  sellerConfigured: t.Boolean(),
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
  events: OrderEvent[] = [],
  invoice: Invoice | null = null,
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
    invoice: invoice
      ? {
          number: formatInvoiceNumber(invoice.number),
          issuedAt: invoice.issuedAt.toISOString(),
          seller: (invoice.sellerSnapshot as ReturnType<typeof seller> | null) ?? seller(),
        }
      : null,
    seller: seller(),
    sellerConfigured: sellerConfigured(),
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      message: e.message,
      actor: e.actor,
      actorEmail: e.actorEmail,
      createdAt: e.createdAt.toISOString(),
    })),
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
      const statusFilter =
        query.status === "all" ? undefined : ne(orders.status, "pending");

      // Search by whatever the person in front of the screen actually has: an
      // email from the customer, or an order reference from a support thread.
      const term = query.q?.trim();
      const search = term
        ? or(
            ilike(orders.email, `%${term}%`),
            ilike(orders.id, `%${term}%`),
            ilike(orders.trackingNumber, `%${term}%`),
          )
        : undefined;

      const where =
        statusFilter && search
          ? and(statusFilter, search)
          : (statusFilter ?? search);

      const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
      const offset = Math.max(query.offset ?? 0, 0);

      // Total is of the *filtered* set, so the pager reflects the current view.
      const [totalRow] = await db
        .select({ n: count() })
        .from(orders)
        .where(where);
      const total = Number(totalRow?.n ?? 0);

      const rows = await db
        .select()
        .from(orders)
        .where(where)
        .orderBy(desc(orders.createdAt))
        .limit(limit)
        .offset(offset);

      const ids = rows.map((o) => o.id);
      const counts = ids.length
        ? await db
            .select({ orderId: orderItems.orderId, n: count() })
            .from(orderItems)
            .where(inArray(orderItems.orderId, ids))
            .groupBy(orderItems.orderId)
        : [];
      const countBy = new Map(counts.map((c) => [c.orderId, Number(c.n)]));

      return {
        orders: rows.map((o) => ({
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
        })),
        total,
        limit,
        offset,
      };
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      query: t.Object({
        status: t.Optional(t.Union([t.Literal("paid"), t.Literal("all")])),
        /** Matches email, order id, or tracking number. */
        q: t.Optional(t.String()),
        limit: t.Optional(t.Integer({ minimum: 1, maximum: 200 })),
        offset: t.Optional(t.Integer({ minimum: 0 })),
      }),
      response: {
        200: t.Object({
          orders: t.Array(OrderSummary),
          /** Total matching the current filters, for paging. */
          total: Int,
          limit: Int,
          offset: Int,
        }),
        401: Unauthorized,
        403: Forbidden,
      },
      detail: { summary: "List orders, searchable and paged (admin)" },
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
      const [items, orderRefunds, events, invoice] = await Promise.all([
        db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
        listRefunds(order.id),
        listOrderEvents(order.id),
        findInvoice(order.id),
      ]);
      return serializeDetail(order, items, orderRefunds, events, invoice);
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
      const [items, orderRefunds, events, invoice] = await Promise.all([
        db.select().from(orderItems).where(eq(orderItems.orderId, params.id)),
        listRefunds(params.id),
        listOrderEvents(params.id),
        findInvoice(params.id),
      ]);
      return serializeDetail(order!, items, orderRefunds, events, invoice);
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
  .post(
    "/:id/invoice",
    async ({ params, user, status }) => {
      const result = await issueInvoice({
        orderId: params.id,
        actor: user?.id ?? null,
      });
      if (!result.ok) return status(result.status, { message: result.message });
      return {
        number: formatInvoiceNumber(result.invoice.number),
        issuedAt: result.invoice.issuedAt.toISOString(),
        seller: (result.invoice.sellerSnapshot as ReturnType<typeof seller> | null) ?? seller(),
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
        200: InvoiceModel,
        401: Unauthorized,
        403: Forbidden,
        404: NotFound,
        409: Message,
        503: Message,
      },
      detail: {
        summary: "Issue the invoice for an order (admin)",
        description:
          "Idempotent: an order has at most one invoice, and pressing this again returns the existing one rather than burning a number. Numbers are sequential and gapless, as Danish bookkeeping law requires.",
      },
    },
  )
  .post(
    "/:id/cancel",
    async ({ params, body, user, status }) => {
      const result = await cancelOrder({
        orderId: params.id,
        refund: body.refund ?? true,
        restock: body.restock ?? true,
        reason: body.reason ?? null,
        actor: user?.id ?? null,
      });
      if (!result.ok) return status(result.status, { message: result.message });
      return { message: result.message };
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      params: t.Object({ id: t.String() }),
      body: t.Object({
        /** Return the money too. Defaults on, since a cancelled paid order owes it. */
        refund: t.Optional(t.Boolean()),
        restock: t.Optional(t.Boolean()),
        reason: t.Optional(t.Nullable(t.String())),
      }),
      response: {
        200: Message,
        400: Message,
        401: Unauthorized,
        403: Forbidden,
        404: NotFound,
        409: Message,
        503: Message,
      },
      detail: {
        summary: "Cancel an order, optionally refunding it (admin)",
        description:
          "Refuses once the order has shipped — that case is a return, refunded against a real shipment, not a cancellation.",
      },
    },
  )
  .post(
    "/:id/resend-confirmation",
    async ({ params, body, user, status }) => {
      const result = await resendConfirmation({
        orderId: params.id,
        email: body.email ?? null,
        actor: user?.id ?? null,
      });
      if (!result.ok) return status(result.status, { message: result.message });
      return { message: result.message };
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      params: t.Object({ id: t.String() }),
      body: t.Object({
        /** Corrects the address on the order as well, when the original was wrong. */
        email: t.Optional(t.Nullable(t.String({ format: "email" }))),
      }),
      response: {
        200: Message,
        400: Message,
        401: Unauthorized,
        403: Forbidden,
        404: NotFound,
        409: Message,
        503: Message,
      },
      detail: { summary: "Send the order confirmation email again (admin)" },
    },
  )
  .patch(
    "/:id/fulfillment",
    async ({ params, body, user, status }) => {
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

      // Two distinct changes can arrive in one request; log only what moved, so
      // the history doesn't fill with entries that record nothing happening.
      if (nextStatus !== current.fulfillmentStatus) {
        await recordOrderEvent({
          orderId: params.id,
          type: "fulfillment.changed",
          actor: user?.id ?? null,
          message: `Fulfillment marked ${nextStatus} (was ${current.fulfillmentStatus})`,
          data: { from: current.fulfillmentStatus, to: nextStatus },
        });
      }
      const carrierChanged =
        body.trackingCarrier !== undefined &&
        body.trackingCarrier !== current.trackingCarrier;
      const numberChanged =
        body.trackingNumber !== undefined &&
        body.trackingNumber !== current.trackingNumber;
      if (carrierChanged || numberChanged) {
        const carrier = updated!.trackingCarrier;
        const number = updated!.trackingNumber;
        await recordOrderEvent({
          orderId: params.id,
          type: "tracking.changed",
          actor: user?.id ?? null,
          message: number
            ? `Tracking set to ${number}${carrier ? ` (${carrier})` : ""}`
            : "Tracking cleared",
          data: {
            carrier,
            number,
            previousCarrier: current.trackingCarrier,
            previousNumber: current.trackingNumber,
          },
        });
      }

      const [items, orderRefunds, events, invoice] = await Promise.all([
        db.select().from(orderItems).where(eq(orderItems.orderId, updated!.id)),
        listRefunds(updated!.id),
        listOrderEvents(updated!.id),
        findInvoice(updated!.id),
      ]);
      return serializeDetail(updated!, items, orderRefunds, events, invoice);
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
