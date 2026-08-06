import { nanoid } from "nanoid";
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Products catalogue. Physical goods, priced in minor units (cents) to avoid
 * floating-point money. Prices are shown VAT-inclusive in the storefront; the
 * VAT itself is computed at checkout by Stripe Tax based on ship-to country.
 */
export const products = pgTable("products", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  /** Unit price in minor units (e.g. cents) of `currency`. */
  priceCents: integer("price_cents").notNull(),
  currency: text("currency").notNull().default("EUR"),
  /** Available stock. Physical goods, so we track inventory. */
  stock: integer("stock").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})
  // RLS is enabled with no policies: Supabase auto-exposes public tables via
  // PostgREST, and this blocks all anon/authenticated access there. The API
  // connects as the `postgres` role, which bypasses RLS, so it is unaffected.
  .enableRLS();

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

/**
 * Back-office administrators. Keyed by the Supabase Auth user id (a UUID,
 * stored as text). Authorization lives in our own database rather than in
 * Supabase custom claims, so it stays portable if we ever leave Supabase Auth.
 */
export const admins = pgTable("admins", {
  userId: text("user_id").primaryKey(),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}).enableRLS();

export type Admin = typeof admins.$inferSelect;

/**
 * Shipping zones. Each zone covers a set of ISO-3166-1 alpha-2 country codes
 * (uppercase). A country may match more than one zone (e.g. "Denmark" and the
 * broader "EU"); `priority` disambiguates — the lowest number wins, so put the
 * most specific zones on a lower priority. Ship-to country selects the zone,
 * whose rates are offered at checkout and whose destination drives VAT.
 */
export const shippingZones = pgTable("shipping_zones", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  name: text("name").notNull().unique(),
  /** ISO-3166-1 alpha-2 codes, uppercase (e.g. ["DK","SE"]). */
  countries: text("countries").array().notNull().default([]),
  /** Lower wins when several zones cover the same country. */
  priority: integer("priority").notNull().default(100),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}).enableRLS();

export type ShippingZone = typeof shippingZones.$inferSelect;
export type NewShippingZone = typeof shippingZones.$inferInsert;

/**
 * Shipping rate rules within a zone. Priced in minor units like products. A
 * rate can become free once the order subtotal reaches `freeAboveCents`.
 * Delivery-day estimates are informational (shown to the customer).
 */
export const shippingRates = pgTable("shipping_rates", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  zoneId: text("zone_id")
    .notNull()
    .references(() => shippingZones.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
  currency: text("currency").notNull().default("EUR"),
  /** If set and the order subtotal is >= this, the rate is free. */
  freeAboveCents: integer("free_above_cents"),
  minDeliveryDays: integer("min_delivery_days"),
  maxDeliveryDays: integer("max_delivery_days"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}).enableRLS();

export type ShippingRate = typeof shippingRates.$inferSelect;
export type NewShippingRate = typeof shippingRates.$inferInsert;

/**
 * Customer orders. Created in a `pending` state when a Stripe Checkout session
 * is opened, then advanced to `paid` by the webhook once payment succeeds
 * (`fulfilled`/`canceled` later). The Stripe session id is unique, which makes
 * webhook handling idempotent — a redelivered event finds the same order.
 *
 * Money is stored in minor units (cents). The pending row carries the amounts
 * we compute (subtotal + shipping); tax and the authoritative total come back
 * from Stripe Tax on the webhook, so `taxCents`/`totalCents` are filled then.
 */
export const orders = pgTable("orders", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  /** pending → paid → fulfilled, or canceled. Kept as text (no DB enum) to
   * match the rest of the schema and stay migration-light. */
  status: text("status").notNull().default("pending"),
  email: text("email"),
  /** Stripe Checkout Session id — unique so webhooks are idempotent. */
  stripeSessionId: text("stripe_session_id").notNull().unique(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  currency: text("currency").notNull().default("EUR"),
  subtotalCents: integer("subtotal_cents").notNull(),
  shippingCents: integer("shipping_cents").notNull().default(0),
  taxCents: integer("tax_cents"),
  totalCents: integer("total_cents"),
  /** Chosen shipping rate (name captured for the order record). */
  shippingRateId: text("shipping_rate_id"),
  shippingRateName: text("shipping_rate_name"),
  /**
   * How the order was placed: a one-off checkout, or a recurring subscription
   * cycle. Subscription cycles reuse this table so the back office manages them
   * with the same views; `subscriptionId` links back to the subscription.
   */
  origin: text("origin").notNull().default("one_time"),
  subscriptionId: text("subscription_id"),
  /**
   * Fulfillment workflow, independent of payment `status`: new → packed →
   * shipped. Back office advances this and records tracking; it stays "new"
   * until someone in the warehouse acts on the order.
   */
  fulfillmentStatus: text("fulfillment_status").notNull().default("new"),
  trackingCarrier: text("tracking_carrier"),
  trackingNumber: text("tracking_number"),
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
  // Ship-to address, captured at checkout (Stripe collects/confirms it).
  shipName: text("ship_name"),
  shipLine1: text("ship_line1"),
  shipLine2: text("ship_line2"),
  shipCity: text("ship_city"),
  shipPostalCode: text("ship_postal_code"),
  shipCountry: text("ship_country"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
}).enableRLS();

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;

/**
 * Line items of an order. Product name and unit price are copied in at purchase
 * time so the order is a faithful historical record even if the product later
 * changes or is archived; `productId` keeps a soft link for back-office lookups.
 */
export const orderItems = pgTable("order_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  /** Soft link — products are soft-deleted, so this is not a hard FK. */
  productId: text("product_id"),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  currency: text("currency").notNull().default("EUR"),
  quantity: integer("quantity").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}).enableRLS();

export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;

/**
 * Subscription plans ("subscribe & save") for a product. Each plan maps to a
 * recurring Stripe Price (created in Stripe when the plan is created); we store
 * the Stripe product/price ids so checkout and Billing stay in sync. Interval
 * is a Stripe billing interval (`week`/`month`) times `intervalCount`.
 */
export const subscriptionPlans = pgTable("subscription_plans", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  name: text("name").notNull(),
  interval: text("interval").notNull().default("month"),
  intervalCount: integer("interval_count").notNull().default(1),
  priceCents: integer("price_cents").notNull(),
  currency: text("currency").notNull().default("EUR"),
  stripeProductId: text("stripe_product_id"),
  stripePriceId: text("stripe_price_id").unique(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}).enableRLS();

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type NewSubscriptionPlan = typeof subscriptionPlans.$inferInsert;

/**
 * A customer subscription, mirrored from Stripe Billing. Stripe is the source
 * of truth for lifecycle (status, period, cancellation); we keep a local copy
 * so the storefront/back office don't need a Stripe round-trip, and so each
 * `invoice.paid` cycle can spawn a fulfillment order from the stored address.
 */
export const subscriptions = pgTable("subscriptions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  /** Stripe Subscription id — unique, so webhook handling is idempotent. */
  stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id"),
  planId: text("plan_id"),
  productId: text("product_id"),
  email: text("email"),
  /** active | past_due | canceled | incomplete | unpaid (from Stripe). */
  status: text("status").notNull().default("incomplete"),
  currency: text("currency").notNull().default("EUR"),
  amountCents: integer("amount_cents"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  // Ship-to address captured at subscribe time, reused for each cycle's order.
  shipName: text("ship_name"),
  shipLine1: text("ship_line1"),
  shipLine2: text("ship_line2"),
  shipCity: text("ship_city"),
  shipPostalCode: text("ship_postal_code"),
  shipCountry: text("ship_country"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}).enableRLS();

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
