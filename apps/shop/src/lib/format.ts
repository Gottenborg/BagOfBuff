/** Format a minor-unit price (cents) as a VAT-inclusive display string. */
export function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/** Human billing cadence, e.g. "every month" or "every 2 weeks". */
export function formatInterval(interval: string, count: number): string {
  return count === 1 ? `every ${interval}` : `every ${count} ${interval}s`;
}
