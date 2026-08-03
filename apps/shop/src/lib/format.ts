/** Format a minor-unit price (cents) as a VAT-inclusive display string. */
export function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
  }).format(cents / 100);
}
