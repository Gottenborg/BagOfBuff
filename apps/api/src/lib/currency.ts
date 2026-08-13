/**
 * Presentment currencies.
 *
 * Bag of Buff is Danish, so DKK is the base currency: the home market sees
 * kroner. The rest of the EU is served in euro. Both are 100-minor-unit
 * currencies (øre / cent), so all existing minor-unit money handling is
 * unchanged — only which currency a given amount is denominated in.
 *
 * The hard constraint this exists to protect: a Stripe Checkout session has one
 * currency. Product prices and shipping rates in a single order must therefore
 * agree, and the ship-to country is what decides.
 */
export const CURRENCIES = ["DKK", "EUR"] as const;

export type Currency = (typeof CURRENCIES)[number];

/** Home market currency; used when nothing else determines one. */
export const BASE_CURRENCY: Currency = "DKK";

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value.toUpperCase());
}

/** Normalize arbitrary input to a supported currency, falling back to base. */
export function toCurrency(value: string | undefined | null): Currency {
  if (!value) return BASE_CURRENCY;
  const upper = value.trim().toUpperCase();
  return isCurrency(upper) ? (upper as Currency) : BASE_CURRENCY;
}

/**
 * Which currency a destination is billed in. Denmark is outside the eurozone
 * and trades in kroner; everywhere else we ship is priced in euro.
 */
export function currencyForCountry(country: string): Currency {
  return country.trim().toUpperCase() === "DK" ? "DKK" : "EUR";
}
