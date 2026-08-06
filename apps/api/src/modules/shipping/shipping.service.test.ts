import { describe, expect, test } from "bun:test";
import type { ShippingRate } from "../../db/schema";
import { computeOptions, normalizeCountry } from "./shipping.service";

/** Build a ShippingRate with sensible defaults for the fields under test. */
function rate(partial: Partial<ShippingRate>): ShippingRate {
  return {
    id: partial.id ?? "r1",
    zoneId: "z1",
    name: partial.name ?? "Standard",
    priceCents: partial.priceCents ?? 500,
    currency: partial.currency ?? "EUR",
    freeAboveCents: partial.freeAboveCents ?? null,
    minDeliveryDays: partial.minDeliveryDays ?? null,
    maxDeliveryDays: partial.maxDeliveryDays ?? null,
    active: partial.active ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("normalizeCountry", () => {
  test("trims and uppercases", () => {
    expect(normalizeCountry(" dk ")).toBe("DK");
    expect(normalizeCountry("de")).toBe("DE");
    expect(normalizeCountry("GB")).toBe("GB");
  });
});

describe("computeOptions", () => {
  test("drops inactive rates", () => {
    const options = computeOptions(
      [rate({ id: "a", active: false }), rate({ id: "b", active: true })],
      0,
    );
    expect(options.map((o) => o.id)).toEqual(["b"]);
  });

  test("applies the free-above threshold", () => {
    const [opt] = computeOptions(
      [rate({ priceCents: 490, freeAboveCents: 5000 })],
      5000,
    );
    expect(opt!.free).toBe(true);
    expect(opt!.priceCents).toBe(0);
    // Base price is preserved so the UI can show "free over €50".
    expect(opt!.baseCents).toBe(490);
  });

  test("charges the rate below the threshold", () => {
    const [opt] = computeOptions(
      [rate({ priceCents: 490, freeAboveCents: 5000 })],
      4999,
    );
    expect(opt!.free).toBe(false);
    expect(opt!.priceCents).toBe(490);
  });

  test("a null threshold is never free", () => {
    const [opt] = computeOptions(
      [rate({ priceCents: 990, freeAboveCents: null })],
      1_000_000,
    );
    expect(opt!.free).toBe(false);
    expect(opt!.priceCents).toBe(990);
  });

  test("orders by effective price, cheapest first", () => {
    const options = computeOptions(
      [
        rate({ id: "express", priceCents: 990 }),
        rate({ id: "standard", priceCents: 490 }),
        rate({ id: "free", priceCents: 700, freeAboveCents: 100 }),
      ],
      5000,
    );
    // "free" becomes 0 → first; then standard (490), then express (990).
    expect(options.map((o) => o.id)).toEqual(["free", "standard", "express"]);
  });
});
