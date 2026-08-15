import { nanoid } from "nanoid";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

/**
 * Products catalogue. Physical goods, priced in minor units (cents) to avoid
 * floating-point money. Prices are shown VAT-inclusive in the storefront; the
 * VAT itself is computed in-house at checkout (see lib/vat).
 */
export const products = pgTable("products", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  slug: text("slug").notNull().unique(),
  /**
   * Stock-keeping unit — the identifier used for inventory, packing lists and
   * accounting. Unique and required: an order line without a SKU can't be
   * picked reliably in a warehouse.
   */
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  /** Long-form product copy. Plain text with paragraph breaks. */
  description: text("description"),
  /**
   * Search/social overrides. Left null, the storefront falls back to the
   * product name and description, so these only need filling in when the
   * marketing copy should differ from the on-page copy.
   */
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  /** Unit price in minor units (e.g. cents) of `currency`. */
  priceCents: integer("price_cents").notNull(),
  /**
   * Reference ("regular") price when the current price is a promotional
   * reduction. When set and greater than `priceCents`, the storefront shows the
   * product as discounted and, per the EU Omnibus directive, the lowest price
   * of the prior 30 days (derived from `product_price_history`).
   */
  compareAtCents: integer("compare_at_cents"),
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
 * Per-currency prices. Bag of Buff sells in kroner at home and euro across the
 * rest of the EU, and a price is a business decision per market — not a live FX
 * conversion — so each currency gets its own stored amount.
 *
 * `products.priceCents` / `products.currency` remain as the base-currency price
 * and are kept in step with the base row here, so anything reading a product
 * still sees a sensible single price.
 */
export const productPrices = pgTable(
  "product_prices",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** ISO-4217, uppercase. See lib/currency for the supported set. */
    currency: text("currency").notNull(),
    priceCents: integer("price_cents").notNull(),
    /** Reference price for a promotion, in this same currency. */
    compareAtCents: integer("compare_at_cents"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("product_prices_product_currency").on(t.productId, t.currency)],
).enableRLS();

export type ProductPrice = typeof productPrices.$inferSelect;
export type NewProductPrice = typeof productPrices.$inferInsert;

/**
 * Product photography. Files live in Supabase Storage (bucket
 * `product-images`); only the public URL and its metadata are stored here.
 *
 * `position` orders the gallery — the lowest is the primary image, used for
 * listings and as the social/OG preview. `alt` is required for accessibility
 * and is shown if the image fails to load.
 */
export const productImages = pgTable("product_images", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  alt: text("alt").notNull().default(""),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}).enableRLS();

export type ProductImage = typeof productImages.$inferSelect;
export type NewProductImage = typeof productImages.$inferInsert;

/**
 * Append-only price history, written whenever a product's price is set or
 * changed. Backs the EU Omnibus directive: on any promotional discount the
 * storefront must show the lowest price of the preceding 30 days.
 */
export const productPriceHistory = pgTable("product_price_history", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  priceCents: integer("price_cents").notNull(),
  currency: text("currency").notNull().default("EUR"),
  recordedAt: timestamp("recorded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}).enableRLS();

export type ProductPriceHistory = typeof productPriceHistory.$inferSelect;

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
 * on the webhook, so `taxCents`/`totalCents` are filled then.
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
 * Refunds issued against an order.
 *
 * Kept as rows rather than a status on the order because an order can be
 * refunded more than once (partially), and consumer law requires being able to
 * show what was returned, when, and why. Stripe remains the source of truth for
 * the money; this records our side, keyed by the Stripe refund id so a
 * redelivered webhook cannot double-count.
 */
export const refunds = pgTable("refunds", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  /** Stripe Refund id — unique, so webhook handling is idempotent. */
  stripeRefundId: text("stripe_refund_id").unique(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  /**
   * Why the money went back. `requested_by_customer` covers the statutory
   * 14-day withdrawal; the rest map to Stripe's reasons.
   */
  reason: text("reason").notNull().default("requested_by_customer"),
  /** Free-text context for the back office (not sent to Stripe). */
  note: text("note"),
  /** pending → succeeded | failed, mirrored from Stripe. */
  status: text("status").notNull().default("pending"),
  /** Supabase user id of the admin who issued it. */
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}).enableRLS();

export type Refund = typeof refunds.$inferSelect;
export type NewRefund = typeof refunds.$inferInsert;

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

/**
 * Everything that has happened to an order, in order.
 *
 * Orders are changed by several actors — the buyer, Stripe's webhooks, and
 * whoever is in the back office — and the order row only ever shows the latest
 * state. When a customer asks why they were refunded twice, or whether anyone
 * marked their parcel shipped, the current row cannot answer. This can.
 *
 * Append-only: rows are never updated or deleted, so the log stays a record of
 * what happened rather than a second copy of the current state.
 */
export const orderEvents = pgTable("order_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  /** Machine-readable kind, e.g. "fulfillment.changed" (see order-events.ts). */
  type: text("type").notNull(),
  /** Human-readable summary, written at the time so it never has to be re-derived. */
  message: text("message").notNull(),
  /** Who caused it: an admin's user id, "stripe", "customer", or "system". */
  actor: text("actor").notNull().default("system"),
  /** Admin email where known, so the log stays readable after staff changes. */
  actorEmail: text("actor_email"),
  /** Structured detail (from/to values, amounts) for anything the message omits. */
  data: jsonb("data"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
},
  // The log is only ever read as "this order's events, oldest first".
  (t) => [index("order_events_order_id_created_at_idx").on(t.orderId, t.createdAt)],
).enableRLS();

export type OrderEvent = typeof orderEvents.$inferSelect;

/**
 * Issued invoices.
 *
 * A separate table because an invoice number is not a formatting of the order
 * id: Danish bookkeeping law (bogføringsloven) requires an unbroken, sequential
 * series, and the documentation must be retained for five years. Deriving the
 * number from anything mutable, or from a filtered view of orders, produces
 * gaps — and a gap is what an auditor asks about.
 *
 * The row also freezes the seller's own details as they were when issued: a
 * company that later moves address must still be able to reproduce the invoice
 * it actually sent.
 */
export const invoices = pgTable("invoices", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  /** Sequential, gapless, never reused. */
  number: integer("number").notNull().unique(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "restrict" })
    .unique(),
  issuedAt: timestamp("issued_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  /** Seller identity at the moment of issue, so the document can be reproduced. */
  sellerSnapshot: jsonb("seller_snapshot"),
  /** Totals at the moment of issue; the order may be refunded later. */
  currency: text("currency").notNull(),
  subtotalCents: integer("subtotal_cents").notNull(),
  shippingCents: integer("shipping_cents").notNull(),
  taxCents: integer("tax_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  createdBy: text("created_by"),
}).enableRLS();

export type Invoice = typeof invoices.$inferSelect;

/**
 * Stock movements: every change to a product's quantity, and why.
 *
 * The stored `products.stock` is the current balance, which is all the shop
 * needs to sell — but a balance alone cannot answer "we counted 40 and the
 * system says 37, what happened?". Without a ledger the honest answer is
 * always "we don't know", and the only remedy is to overwrite the number and
 * lose the discrepancy.
 *
 * Every path that changes stock writes a row here: sales, returns, deliveries
 * received, and manual corrections. Append-only — a mistaken movement is
 * corrected by another movement, never by editing history.
 */
export const stockMovements = pgTable("stock_movements", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  /** Signed: positive receives, negative removes. Never zero. */
  delta: integer("delta").notNull(),
  /** The balance immediately after this movement, for auditing drift. */
  balanceAfter: integer("balance_after").notNull(),
  /** Why it moved — see STOCK_REASONS. */
  reason: text("reason").notNull(),
  note: text("note"),
  /** Set when the movement came from an order (sale, return). */
  orderId: text("order_id").references(() => orders.id, {
    onDelete: "set null",
  }),
  /** Admin user id, or "system" for order-driven movements. */
  actor: text("actor").notNull().default("system"),
  actorEmail: text("actor_email"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
},
  (t) => [index("stock_movements_product_id_created_at_idx").on(t.productId, t.createdAt)],
).enableRLS();

export type StockMovement = typeof stockMovements.$inferSelect;
