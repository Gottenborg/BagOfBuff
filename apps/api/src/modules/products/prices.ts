import { inArray } from "drizzle-orm";
import { db } from "../../db";
import { productPrices, type Product, type ProductPrice } from "../../db/schema";
import { BASE_CURRENCY, type Currency } from "../../lib/currency";

export interface ResolvedPrice {
  currency: Currency;
  priceCents: number;
  compareAtCents: number | null;
}

/** All stored prices for a set of products, grouped by product id. */
export async function pricesForProducts(
  productIds: string[],
): Promise<Map<string, ProductPrice[]>> {
  if (productIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(productPrices)
    .where(inArray(productPrices.productId, productIds));

  const byProduct = new Map<string, ProductPrice[]>();
  for (const row of rows) {
    const list = byProduct.get(row.productId) ?? [];
    list.push(row);
    byProduct.set(row.productId, list);
  }
  return byProduct;
}

/**
 * The price to charge for a product in a given currency.
 *
 * Falls back to the product's own base-currency price when no row exists for
 * that currency yet, so adding a currency never makes products unbuyable — the
 * back office flags products missing an explicit price so they can be set
 * deliberately rather than left to a fallback.
 */
export function resolvePrice(
  product: Product,
  prices: ProductPrice[] | undefined,
  currency: Currency,
): ResolvedPrice {
  const match = prices?.find((p) => p.currency === currency);
  if (match) {
    return {
      currency,
      priceCents: match.priceCents,
      compareAtCents: match.compareAtCents,
    };
  }
  return {
    currency: (product.currency as Currency) ?? BASE_CURRENCY,
    priceCents: product.priceCents,
    compareAtCents: product.compareAtCents,
  };
}

/** True when the product has an explicitly stored price in `currency`. */
export function hasPriceIn(
  prices: ProductPrice[] | undefined,
  currency: Currency,
): boolean {
  return Boolean(prices?.some((p) => p.currency === currency));
}
