import { describe, expect, test } from "bun:test";
import type { Product, ProductPrice } from "../../db/schema";
import { hasPriceIn, resolvePrice } from "./prices";

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    slug: "bag-of-buff",
    sku: "BAG-OF-BUFF",
    name: "Bag of Buff",
    description: null,
    priceCents: 22400,
    compareAtCents: null,
    currency: "DKK",
    stock: 10,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function price(
  currency: string,
  priceCents: number,
  compareAtCents: number | null = null,
): ProductPrice {
  return {
    id: `pp-${currency}`,
    productId: "p1",
    currency,
    priceCents,
    compareAtCents,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("resolvePrice", () => {
  const prices = [price("DKK", 22400), price("EUR", 2999, 3499)];

  test("returns the amount stored for the requested currency", () => {
    expect(resolvePrice(product(), prices, "DKK")).toEqual({
      currency: "DKK",
      priceCents: 22400,
      compareAtCents: null,
    });
    expect(resolvePrice(product(), prices, "EUR")).toEqual({
      currency: "EUR",
      priceCents: 2999,
      compareAtCents: 3499,
    });
  });

  test("never converts between currencies", () => {
    // 22400 øre is not 2999 cents at any rate — each market has its own price.
    const dkk = resolvePrice(product(), prices, "DKK");
    const eur = resolvePrice(product(), prices, "EUR");
    expect(dkk.priceCents).not.toBe(eur.priceCents);
  });

  test("falls back to the product's base price when a currency is missing", () => {
    // Adding a currency must not make products unbuyable; the back office
    // flags the gap instead.
    const onlyDkk = [price("DKK", 22400)];
    const resolved = resolvePrice(product(), onlyDkk, "EUR");
    expect(resolved.currency).toBe("DKK");
    expect(resolved.priceCents).toBe(22400);
  });

  test("falls back when the product has no stored prices at all", () => {
    const resolved = resolvePrice(product(), undefined, "EUR");
    expect(resolved.currency).toBe("DKK");
    expect(resolved.priceCents).toBe(22400);
  });
});

describe("hasPriceIn", () => {
  test("reports which currencies are deliberately priced", () => {
    const prices = [price("DKK", 22400)];
    expect(hasPriceIn(prices, "DKK")).toBe(true);
    expect(hasPriceIn(prices, "EUR")).toBe(false);
    expect(hasPriceIn(undefined, "DKK")).toBe(false);
  });
});
