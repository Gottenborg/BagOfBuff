/** Format a minor-unit price (cents) as a display string. */
export function formatPrice(cents: number, currency: string): string {
  // Format in the locale that matches the currency: a Danish shopper expects
  // "224,00 kr.", not "DKK 224.00".
  const locale = currency === "DKK" ? "da-DK" : "en-IE";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/** Short human date, e.g. "6 Aug 2026, 14:32". */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}
