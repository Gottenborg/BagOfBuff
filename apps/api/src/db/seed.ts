/**
 * Seeds launch data. Idempotent — re-running updates existing rows rather than
 * inserting duplicates.
 *
 *   bun run db:seed
 *
 * Requires DATABASE_URL to point at the Supabase database.
 */
import { eq } from "drizzle-orm";
import { db } from "./index";
import {
  productPrices,
  products,
  shippingRates,
  shippingZones,
} from "./schema";

/** Prices are set per market, not converted at runtime. */
const launchPrices = [
  { currency: "DKK", priceCents: 22400 },
  { currency: "EUR", priceCents: 2999 },
];

const launchProduct = {
  slug: "bag-of-buff",
  sku: "BAG-OF-BUFF",
  name: "Bag of Buff",
  description:
    "The original Bag of Buff. Placeholder copy — edit this in the back office.",
  priceCents: 22400,
  currency: "DKK",
  stock: 100,
  active: true,
};

/** EU-27 (minus DK, which gets its own more-specific zone). */
const EU_COUNTRIES = [
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
];

/** Named zones with their default rates. Prices in minor units (EUR cents). */
const shipping: {
  name: string;
  countries: string[];
  priority: number;
  currency: string;
  rates: {
    name: string;
    priceCents: number;
    freeAboveCents?: number;
    minDeliveryDays?: number;
    maxDeliveryDays?: number;
  }[];
}[] = [
  {
    name: "Denmark",
    countries: ["DK"],
    priority: 10,
    // The home market is billed in kroner, so its rates are too — checkout
    // offers only rates matching the destination's currency.
    currency: "DKK",
    rates: [
      {
        name: "Standard",
        priceCents: 3700,
        freeAboveCents: 37300,
        minDeliveryDays: 1,
        maxDeliveryDays: 3,
      },
      {
        name: "Express",
        priceCents: 7400,
        minDeliveryDays: 1,
        maxDeliveryDays: 1,
      },
    ],
  },
  {
    name: "European Union",
    countries: EU_COUNTRIES,
    priority: 50,
    currency: "EUR",
    rates: [
      {
        name: "Standard",
        priceCents: 690,
        freeAboveCents: 7500,
        minDeliveryDays: 2,
        maxDeliveryDays: 5,
      },
      {
        name: "Express",
        priceCents: 1490,
        minDeliveryDays: 1,
        maxDeliveryDays: 2,
      },
    ],
  },
  {
    name: "International",
    countries: ["GB", "NO", "CH", "US"],
    priority: 90,
    currency: "EUR",
    rates: [
      {
        name: "Standard",
        priceCents: 1990,
        minDeliveryDays: 5,
        maxDeliveryDays: 10,
      },
    ],
  },
];

async function seed() {
  const [product] = await db
    .insert(products)
    .values(launchProduct)
    .onConflictDoUpdate({
      target: products.slug,
      set: {
        name: launchProduct.name,
        description: launchProduct.description,
        priceCents: launchProduct.priceCents,
        currency: launchProduct.currency,
        stock: launchProduct.stock,
        active: launchProduct.active,
        updatedAt: new Date(),
      },
    })
    .returning();
  console.log(`✅ Seeded launch product: ${launchProduct.slug}`);

  for (const price of launchPrices) {
    await db
      .insert(productPrices)
      .values({
        productId: product!.id,
        currency: price.currency,
        priceCents: price.priceCents,
      })
      .onConflictDoUpdate({
        target: [productPrices.productId, productPrices.currency],
        set: { priceCents: price.priceCents, updatedAt: new Date() },
      });
  }
  console.log(
    `✅ Seeded prices: ${launchPrices.map((p) => `${p.priceCents / 100} ${p.currency}`).join(", ")}`,
  );

  for (const zone of shipping) {
    const [row] = await db
      .insert(shippingZones)
      .values({
        name: zone.name,
        countries: zone.countries,
        priority: zone.priority,
        active: true,
      })
      .onConflictDoUpdate({
        target: shippingZones.name,
        set: {
          countries: zone.countries,
          priority: zone.priority,
          active: true,
          updatedAt: new Date(),
        },
      })
      .returning({ id: shippingZones.id });

    // Replace the zone's rates so re-seeding stays idempotent.
    await db.delete(shippingRates).where(eq(shippingRates.zoneId, row!.id));
    await db.insert(shippingRates).values(
      zone.rates.map((r) => ({
        zoneId: row!.id,
        name: r.name,
        priceCents: r.priceCents,
        currency: zone.currency,
        freeAboveCents: r.freeAboveCents ?? null,
        minDeliveryDays: r.minDeliveryDays ?? null,
        maxDeliveryDays: r.maxDeliveryDays ?? null,
        active: true,
      })),
    );
  }
  console.log(
    `✅ Seeded shipping zones: ${shipping.map((z) => z.name).join(", ")}`,
  );

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
