import { and, desc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import {
  subscriptionPlans,
  subscriptions,
  type Subscription,
  type SubscriptionPlan,
} from "../../db/schema";
import { authPlugin, isAdmin } from "../auth/auth.plugin";
import {
  createPlan,
  createSubscriptionCheckout,
  emailPortalLink,
} from "./subscriptions.service";

const Message = t.Object({ message: t.String() });
const Unauthorized = t.Object({ message: t.String() });
const Forbidden = t.Object({ message: t.String() });
const Int = t.Number();

const PlanModel = t.Object({
  id: t.String(),
  productId: t.String(),
  name: t.String(),
  interval: t.String(),
  intervalCount: Int,
  priceCents: Int,
  currency: t.String(),
  active: t.Boolean(),
});

const SubscriptionModel = t.Object({
  id: t.String(),
  planId: t.Nullable(t.String()),
  productId: t.Nullable(t.String()),
  email: t.Nullable(t.String()),
  status: t.String(),
  currency: t.String(),
  amountCents: t.Nullable(Int),
  currentPeriodEnd: t.Nullable(t.String({ format: "date-time" })),
  cancelAtPeriodEnd: t.Boolean(),
  createdAt: t.String({ format: "date-time" }),
});

function serializePlan(p: SubscriptionPlan) {
  return {
    id: p.id,
    productId: p.productId,
    name: p.name,
    interval: p.interval,
    intervalCount: p.intervalCount,
    priceCents: p.priceCents,
    currency: p.currency,
    active: p.active,
  };
}

function serializeSubscription(s: Subscription) {
  return {
    id: s.id,
    planId: s.planId,
    productId: s.productId,
    email: s.email,
    status: s.status,
    currency: s.currency,
    amountCents: s.amountCents,
    currentPeriodEnd: s.currentPeriodEnd
      ? s.currentPeriodEnd.toISOString()
      : null,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    createdAt: s.createdAt.toISOString(),
  };
}

export const subscriptionsRoutes = new Elysia({ tags: ["Subscriptions"] })
  .use(authPlugin)
  // --- Public: storefront ------------------------------------------------
  .get(
    "/subscription-plans",
    async ({ query }) => {
      const rows = query.productId
        ? await db
            .select()
            .from(subscriptionPlans)
            .where(
              and(
                eq(subscriptionPlans.active, true),
                eq(subscriptionPlans.productId, query.productId),
              ),
            )
        : await db
            .select()
            .from(subscriptionPlans)
            .where(eq(subscriptionPlans.active, true));
      return rows.map(serializePlan);
    },
    {
      query: t.Object({ productId: t.Optional(t.String()) }),
      response: { 200: t.Array(PlanModel) },
      detail: { summary: "List active subscription plans" },
    },
  )
  .post(
    "/checkout/subscription",
    async ({ body, status }) => {
      const result = await createSubscriptionCheckout({
        planId: body.planId,
        email: body.email ?? null,
      });
      if (!result.ok) return status(result.status, { message: result.message });
      return { url: result.url };
    },
    {
      body: t.Object({
        planId: t.String({ minLength: 1 }),
        email: t.Optional(t.Nullable(t.String({ format: "email" }))),
      }),
      response: {
        200: t.Object({ url: t.String() }),
        400: Message,
        404: Message,
        503: Message,
      },
      detail: { summary: "Start a subscription checkout for a plan" },
    },
  )
  .post(
    "/account/portal",
    async ({ body }) => {
      // Fire-and-forget: always returns the same generic result so it can't be
      // used to probe which emails have a subscription.
      await emailPortalLink(body.email);
      return {
        message:
          "If that email has a subscription, we've sent a link to manage it.",
      };
    },
    {
      body: t.Object({ email: t.String({ format: "email" }) }),
      response: { 200: Message },
      detail: { summary: "Email a Stripe Billing portal link" },
    },
  )
  // --- Admin: plans ------------------------------------------------------
  .post(
    "/admin/subscription-plans",
    async ({ body, status }) => {
      const result = await createPlan({
        productId: body.productId,
        name: body.name,
        interval: body.interval,
        intervalCount: body.intervalCount ?? 1,
        priceCents: body.priceCents,
      });
      if (!result.ok) return status(result.status, { message: result.message });
      return status(201, serializePlan(result.plan));
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      body: t.Object({
        productId: t.String({ minLength: 1 }),
        name: t.String({ minLength: 1 }),
        interval: t.Union([t.Literal("week"), t.Literal("month")]),
        intervalCount: t.Optional(t.Integer({ minimum: 1 })),
        priceCents: t.Integer({ minimum: 0 }),
      }),
      response: {
        201: PlanModel,
        400: Message,
        401: Unauthorized,
        403: Forbidden,
        404: Message,
        503: Message,
      },
      detail: { summary: "Create a subscription plan (admin)" },
    },
  )
  .get(
    "/admin/subscription-plans",
    async () => {
      const rows = await db
        .select()
        .from(subscriptionPlans)
        .orderBy(desc(subscriptionPlans.createdAt));
      return rows.map(serializePlan);
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      response: {
        200: t.Array(PlanModel),
        401: Unauthorized,
        403: Forbidden,
      },
      detail: { summary: "List all subscription plans (admin)" },
    },
  )
  .patch(
    "/admin/subscription-plans/:id",
    async ({ params, body, status }) => {
      const [updated] = await db
        .update(subscriptionPlans)
        .set({ active: body.active, updatedAt: new Date() })
        .where(eq(subscriptionPlans.id, params.id))
        .returning();
      if (!updated) return status(404, { message: "Plan not found" });
      return serializePlan(updated);
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      params: t.Object({ id: t.String() }),
      body: t.Object({ active: t.Boolean() }),
      response: {
        200: PlanModel,
        401: Unauthorized,
        403: Forbidden,
        404: Message,
      },
      detail: { summary: "Activate/deactivate a subscription plan (admin)" },
    },
  )
  // --- Admin: subscriptions ---------------------------------------------
  .get(
    "/admin/subscriptions",
    async () => {
      const rows = await db
        .select()
        .from(subscriptions)
        .orderBy(desc(subscriptions.createdAt));
      return rows.map(serializeSubscription);
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      response: {
        200: t.Array(SubscriptionModel),
        401: Unauthorized,
        403: Forbidden,
      },
      detail: { summary: "List subscriptions (admin)" },
    },
  );
