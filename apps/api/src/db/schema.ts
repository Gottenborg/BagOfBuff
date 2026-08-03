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
});

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
