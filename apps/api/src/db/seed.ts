/**
 * Seeds the launch product. Idempotent — re-running updates the existing row
 * matched by slug rather than inserting a duplicate.
 *
 *   bun run db:seed
 *
 * Requires DATABASE_URL to point at the Supabase database.
 */
import { db } from "./index";
import { products } from "./schema";

const launchProduct = {
  slug: "bag-of-buff",
  name: "Bag of Buff",
  description:
    "The original Bag of Buff. Placeholder copy — edit this in the back office.",
  priceCents: 2999,
  currency: "EUR",
  stock: 100,
  active: true,
};

async function seed() {
  await db
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
    });

  console.log(`✅ Seeded launch product: ${launchProduct.slug}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
