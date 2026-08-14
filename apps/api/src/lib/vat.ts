/**
 * VAT, calculated in-house.
 *
 * Why not Stripe Tax: a Danish shop selling to EU consumers charges *Danish*
 * VAT on everything until cross-border B2C sales pass the EU-wide OSS threshold
 * of €10,000 in a calendar year (Council Directive 2006/112/EC art. 59c). One
 * rate, no country table — so under the threshold this is arithmetic, and
 * paying per transaction for a destination-rate engine buys nothing.
 *
 * That stops being true the moment the threshold is crossed: from then on each
 * sale carries the *destination* country's rate, which is a maintained table
 * with real per-product-category rules. `ossStatus` exists to make the crossing
 * visible before it happens rather than after — see oss.ts.
 *
 * Prices are stored and displayed VAT-inclusive (the norm for EU consumer
 * sales, and required by the Price Indication Directive), so what we record is
 * the VAT *contained in* a total, never an amount added on top.
 */

/** Danish standard rate. Supplements are standard-rated in Denmark. */
export const DOMESTIC_VAT_RATE = 0.25;

/** Where we are established, and therefore whose VAT we charge under the OSS threshold. */
export const HOME_COUNTRY = "DK";

/**
 * The VAT contained in a gross, VAT-inclusive amount.
 *
 * gross = net × (1 + rate), so vat = gross × rate / (1 + rate).
 * Rounded half-up to the minor unit, which is what Danish invoicing expects and
 * what Stripe reports; the caller keeps `gross` authoritative and derives net as
 * `gross - vat` so the three always reconcile exactly.
 */
export function vatFromGross(
  grossCents: number,
  rate: number = DOMESTIC_VAT_RATE,
): number {
  if (!Number.isFinite(grossCents) || grossCents <= 0) return 0;
  if (rate <= 0) return 0;
  return Math.round((grossCents * rate) / (1 + rate));
}

/** The net (ex-VAT) amount inside a gross amount. Always `gross - vat`. */
export function netFromGross(
  grossCents: number,
  rate: number = DOMESTIC_VAT_RATE,
): number {
  return grossCents - vatFromGross(grossCents, rate);
}

/**
 * The VAT rate to charge on a sale shipped to `country`.
 *
 * Under the OSS threshold this is the home rate for every EU destination —
 * including the home country itself. Exports outside the EU are zero-rated, and
 * the buyer pays import VAT on arrival.
 */
export function rateForCountry(country: string | null | undefined): number {
  const cc = (country ?? "").trim().toUpperCase();
  if (!cc) return DOMESTIC_VAT_RATE; // not yet known — assume domestic
  return isEuCountry(cc) ? DOMESTIC_VAT_RATE : 0;
}

/** EU member states (VAT territory), for deciding whether VAT applies at all. */
const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR",
  "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO",
  "SE", "SI", "SK",
]);

export function isEuCountry(country: string | null | undefined): boolean {
  return EU_COUNTRIES.has((country ?? "").trim().toUpperCase());
}
