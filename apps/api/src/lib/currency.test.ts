import { describe, expect, test } from "bun:test";
import {
  BASE_CURRENCY,
  currencyForCountry,
  isCurrency,
  toCurrency,
} from "./currency";

describe("currencyForCountry", () => {
  test("Denmark is billed in kroner", () => {
    expect(currencyForCountry("DK")).toBe("DKK");
    expect(currencyForCountry("dk")).toBe("DKK");
    expect(currencyForCountry(" DK ")).toBe("DKK");
  });

  test("the rest of the EU is billed in euro", () => {
    for (const country of ["DE", "FR", "SE", "NL", "IE", "PL"]) {
      expect(currencyForCountry(country)).toBe("EUR");
    }
  });

  test("non-EU destinations we ship to are billed in euro", () => {
    expect(currencyForCountry("GB")).toBe("EUR");
    expect(currencyForCountry("US")).toBe("EUR");
  });
});

describe("toCurrency", () => {
  test("accepts supported currencies in any case", () => {
    expect(toCurrency("dkk")).toBe("DKK");
    expect(toCurrency("EUR")).toBe("EUR");
  });

  test("falls back to the base currency for anything else", () => {
    // An unknown currency must not produce prices in a currency we don't sell
    // in; the home market is the safe default.
    expect(toCurrency("USD")).toBe(BASE_CURRENCY);
    expect(toCurrency("")).toBe(BASE_CURRENCY);
    expect(toCurrency(undefined)).toBe(BASE_CURRENCY);
    expect(toCurrency(null)).toBe(BASE_CURRENCY);
  });
});

describe("isCurrency", () => {
  test("recognises only what we sell in", () => {
    expect(isCurrency("DKK")).toBe(true);
    expect(isCurrency("EUR")).toBe(true);
    expect(isCurrency("SEK")).toBe(false);
  });
});

describe("base currency", () => {
  test("is DKK — Bag of Buff is Danish", () => {
    expect(BASE_CURRENCY).toBe("DKK");
  });
});
