import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { orderItems, orders, subscriptions } from "../../db/schema";
import { authPlugin, isAdmin } from "../auth/auth.plugin";

const Unauthorized = t.Object({ message: t.String() });
const Forbidden = t.Object({ message: t.String() });
const NotFound = t.Object({ message: t.String() });
const Int = t.Number();

/**
 * Customers are derived rather than stored: checkout is guest-based (Stripe
 * collects the email), so a "customer" is the set of orders and subscriptions
 * sharing an email address. That keeps a single source of truth — no customer
 * record to drift out of sync — and it means every paying customer appears here
 * without a signup step.
 *
 * Only orders that were actually paid count toward spend; pending (abandoned)
 * checkouts are excluded from totals.
 */
const CustomerSummary = t.Object({
  email: t.String(),
  orderCount: Int,
  lifetimeValueCents: Int,
  currency: t.String(),
  firstOrderAt: t.Nullable(t.String({ format: "date-time" })),
  lastOrderAt: t.Nullable(t.String({ format: "date-time" })),
  activeSubscriptions: Int,
});

const CustomerOrder = t.Object({
  id: t.String(),
  status: t.String(),
  fulfillmentStatus: t.String(),
  origin: t.String(),
  totalCents: t.Nullable(Int),
  currency: t.String(),
  itemSummary: t.String(),
  createdAt: t.String({ format: "date-time" }),
});

const CustomerSubscription = t.Object({
  id: t.String(),
  status: t.String(),
  amountCents: t.Nullable(Int),
  currency: t.String(),
  currentPeriodEnd: t.Nullable(t.String({ format: "date-time" })),
  cancelAtPeriodEnd: t.Boolean(),
});

const CustomerDetail = t.Object({
  email: t.String(),
  orderCount: Int,
  lifetimeValueCents: Int,
  currency: t.String(),
  firstOrderAt: t.Nullable(t.String({ format: "date-time" })),
  lastOrderAt: t.Nullable(t.String({ format: "date-time" })),
  shipping: t.Nullable(
    t.Object({
      name: t.Nullable(t.String()),
      line1: t.Nullable(t.String()),
      line2: t.Nullable(t.String()),
      city: t.Nullable(t.String()),
      postalCode: t.Nullable(t.String()),
      country: t.Nullable(t.String()),
    }),
  ),
  orders: t.Array(CustomerOrder),
  subscriptions: t.Array(CustomerSubscription),
});

/** Orders that represent real money (exclude abandoned checkouts). */
const PAID_STATUSES = sql`${orders.status} in ('paid','fulfilled')`;

export const customersRoutes = new Elysia({
  prefix: "/admin/customers",
  tags: ["Customers (admin)"],
})
  .use(authPlugin)
  .get(
    "/",
    async ({ query }) => {
      const search = query.q?.trim().toLowerCase();

      // Group on the lowercased email: Stripe returns whatever case the
      // customer typed, and "Buyer@x.com" must not become a second customer
      // with its own (split) lifetime value.
      const rows = await db
        .select({
          email: sql<string>`lower(${orders.email})`,
          orderCount: sql<number>`count(*) filter (where ${PAID_STATUSES})`,
          lifetimeValueCents: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${PAID_STATUSES}), 0)`,
          currency: sql<string>`min(${orders.currency})`,
          firstOrderAt: sql<string | null>`min(${orders.createdAt}) filter (where ${PAID_STATUSES})`,
          lastOrderAt: sql<string | null>`max(${orders.createdAt}) filter (where ${PAID_STATUSES})`,
        })
        .from(orders)
        .where(
          search
            ? and(isNotNull(orders.email), sql`lower(${orders.email}) like ${`%${search}%`}`)
            : isNotNull(orders.email),
        )
        .groupBy(sql`lower(${orders.email})`)
        .orderBy(desc(sql`max(${orders.createdAt})`));

      // Active subscription counts, keyed by email.
      const subs = await db
        .select({
          email: sql<string>`lower(${subscriptions.email})`,
          n: sql<number>`count(*)`,
        })
        .from(subscriptions)
        .where(
          and(isNotNull(subscriptions.email), eq(subscriptions.status, "active")),
        )
        .groupBy(sql`lower(${subscriptions.email})`);
      const subsByEmail = new Map(
        subs.map((s) => [s.email ?? "", Number(s.n)]),
      );

      return rows
        .filter((r) => r.email)
        .map((r) => ({
          email: r.email!,
          orderCount: Number(r.orderCount),
          lifetimeValueCents: Number(r.lifetimeValueCents),
          currency: r.currency ?? "EUR",
          firstOrderAt: r.firstOrderAt
            ? new Date(r.firstOrderAt).toISOString()
            : null,
          lastOrderAt: r.lastOrderAt
            ? new Date(r.lastOrderAt).toISOString()
            : null,
          activeSubscriptions: subsByEmail.get(r.email!) ?? 0,
        }));
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      query: t.Object({ q: t.Optional(t.String()) }),
      response: {
        200: t.Array(CustomerSummary),
        401: Unauthorized,
        403: Forbidden,
      },
      detail: {
        summary: "List customers, derived from orders (admin)",
        description:
          "Customers are aggregated by email across orders and subscriptions; checkout is guest-based, so there is no separate customer record. Optional `q` filters by email substring.",
      },
    },
  )
  .get(
    "/:email",
    async ({ params, status }) => {
      const email = decodeURIComponent(params.email).toLowerCase();

      const customerOrders = await db
        .select()
        .from(orders)
        .where(sql`lower(${orders.email}) = ${email}`)
        .orderBy(desc(orders.createdAt));

      const customerSubs = await db
        .select()
        .from(subscriptions)
        .where(sql`lower(${subscriptions.email}) = ${email}`)
        .orderBy(desc(subscriptions.createdAt));

      if (customerOrders.length === 0 && customerSubs.length === 0) {
        return status(404, { message: "Customer not found" });
      }

      // Line items for the listed orders, so each order shows what was bought.
      const ids = customerOrders.map((o) => o.id);
      const items = ids.length
        ? await db
            .select()
            .from(orderItems)
            .where(inArray(orderItems.orderId, ids))
        : [];
      const itemsByOrder = new Map<string, string[]>();
      for (const i of items) {
        const list = itemsByOrder.get(i.orderId) ?? [];
        list.push(`${i.quantity}× ${i.name}`);
        itemsByOrder.set(i.orderId, list);
      }

      const paid = customerOrders.filter(
        (o) => o.status === "paid" || o.status === "fulfilled",
      );
      const lifetimeValueCents = paid.reduce(
        (sum, o) => sum + (o.totalCents ?? 0),
        0,
      );
      // Most recent order with an address is the best known shipping address.
      const withAddress = customerOrders.find((o) => o.shipLine1);

      return {
        email,
        orderCount: paid.length,
        lifetimeValueCents,
        currency: customerOrders[0]?.currency ?? customerSubs[0]?.currency ?? "EUR",
        firstOrderAt: paid.length
          ? paid[paid.length - 1]!.createdAt.toISOString()
          : null,
        lastOrderAt: paid.length ? paid[0]!.createdAt.toISOString() : null,
        shipping: withAddress
          ? {
              name: withAddress.shipName,
              line1: withAddress.shipLine1,
              line2: withAddress.shipLine2,
              city: withAddress.shipCity,
              postalCode: withAddress.shipPostalCode,
              country: withAddress.shipCountry,
            }
          : null,
        orders: customerOrders.map((o) => ({
          id: o.id,
          status: o.status,
          fulfillmentStatus: o.fulfillmentStatus,
          origin: o.origin,
          totalCents: o.totalCents,
          currency: o.currency,
          itemSummary: (itemsByOrder.get(o.id) ?? []).join(", ") || "—",
          createdAt: o.createdAt.toISOString(),
        })),
        subscriptions: customerSubs.map((s) => ({
          id: s.id,
          status: s.status,
          amountCents: s.amountCents,
          currency: s.currency,
          currentPeriodEnd: s.currentPeriodEnd
            ? s.currentPeriodEnd.toISOString()
            : null,
          cancelAtPeriodEnd: s.cancelAtPeriodEnd,
        })),
      };
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      params: t.Object({ email: t.String() }),
      response: {
        200: CustomerDetail,
        401: Unauthorized,
        403: Forbidden,
        404: NotFound,
      },
      detail: { summary: "Get a customer's orders and subscriptions (admin)" },
    },
  );
