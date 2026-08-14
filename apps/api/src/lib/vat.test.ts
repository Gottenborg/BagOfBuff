import { describe, expect, test } from "bun:test";
import {
  DOMESTIC_VAT_RATE,
  isEuCountry,
  netFromGross,
  rateForCountry,
  vatFromGross,
} from "./vat";

/**
 * VAT arithmetic.
 *
 * These numbers end up on invoices and in the VAT return, so the properties
 * that matter are exactness and reconciliation: net + vat must equal gross for
 * every amount, with no rounding drift hiding in the middle.
 */

describe("vatFromGross", () => {
  test("extracts 25% from a VAT-inclusive total", () => {
    // 298,00 kr. gross → 59,60 kr. VAT (the live test order).
    expect(vatFromGross(29800)).toBe(5960);
  });

  test("net and VAT always reconcile to the gross amount", () => {
    // Rounding must never lose or invent a øre, at any amount.
    for (const gross of [1, 2, 3, 99, 100, 12345, 22400, 29800, 999999]) {
      expect(netFromGross(gross) + vatFromGross(gross)).toBe(gross);
    }
  });

  test("rounds half-up at the minor unit", () => {
    // 5 × 0.25/1.25 = 1.0 exactly.
    expect(vatFromGross(5)).toBe(1);
    // 3 × 0.2 = 0.6 → 1
    expect(vatFromGross(3)).toBe(1);
    // 2 × 0.2 = 0.4 → 0
    expect(vatFromGross(2)).toBe(0);
  });

  test("a zero-rated sale contains no VAT", () => {
    expect(vatFromGross(29800, 0)).toBe(0);
    expect(netFromGross(29800, 0)).toBe(29800);
  });

  test("non-positive and non-finite amounts yield no VAT", () => {
    expect(vatFromGross(0)).toBe(0);
    expect(vatFromGross(-100)).toBe(0);
    expect(vatFromGross(Number.NaN)).toBe(0);
  });

  test("the rate is the Danish standard rate", () => {
    expect(DOMESTIC_VAT_RATE).toBe(0.25);
  });
});

describe("rateForCountry", () => {
  test("Danish VAT applies to every EU destination under the OSS threshold", () => {
    // The whole point of the threshold: one rate, not the destination's.
    expect(rateForCountry("DK")).toBe(0.25);
    expect(rateForCountry("DE")).toBe(0.25);
    expect(rateForCountry("FR")).toBe(0.25);
    expect(rateForCountry("nl")).toBe(0.25);
  });

  test("sales outside the EU are zero-rated", () => {
    // The buyer pays import VAT on arrival instead.
    expect(rateForCountry("GB")).toBe(0);
    expect(rateForCountry("US")).toBe(0);
    expect(rateForCountry("NO")).toBe(0);
    expect(rateForCountry("CH")).toBe(0);
  });

  test("an unknown destination is treated as domestic", () => {
    // Charging VAT and refunding it beats under-charging and owing it.
    expect(rateForCountry(null)).toBe(0.25);
    expect(rateForCountry("")).toBe(0.25);
  });
});

describe("isEuCountry", () => {
  test("post-Brexit UK is outside the EU VAT territory", () => {
    expect(isEuCountry("GB")).toBe(false);
  });

  test("recognises members regardless of case or padding", () => {
    expect(isEuCountry(" se ")).toBe(true);
    expect(isEuCountry("hr")).toBe(true);
  });
});
