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
