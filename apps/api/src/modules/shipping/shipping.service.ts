import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import {
  shippingRates,
  shippingZones,
  type ShippingRate,
  type ShippingZone,
} from "../../db/schema";

/** Normalize a country code to ISO-3166-1 alpha-2 uppercase. */
export function normalizeCountry(country: string): string {
  return country.trim().toUpperCase();
}

/**
 * Resolve the single active zone that serves a country. When several zones
 * cover it, the lowest `priority` wins (most specific); ties break on the
 * smaller country list, then name, for determinism. Returns null when nothing
 * ships there.
 */
export async function resolveZoneForCountry(
  country: string,
): Promise<ShippingZone | null> {
  const code = normalizeCountry(country);
  const zones = await db
    .select()
    .from(shippingZones)
    .where(eq(shippingZones.active, true));

  const matches = zones.filter((z) => z.countries.includes(code));
  if (matches.length === 0) return null;

  matches.sort(
    (a, b) =>
      a.priority - b.priority ||
      a.countries.length - b.countries.length ||
      a.name.localeCompare(b.name),
  );
  return matches[0]!;
}

export interface ShippingOption {
  id: string;
  name: string;
  /** Effective price after any free-shipping threshold is applied. */
  priceCents: number;
  /** Undiscounted price, so the UI can show "free over €X". */
  baseCents: number;
  currency: string;
  free: boolean;
  minDeliveryDays: number | null;
  maxDeliveryDays: number | null;
}

/** Turn a zone's active rates into ordered, subtotal-aware options. */
export function computeOptions(
  rates: ShippingRate[],
  subtotalCents: number,
): ShippingOption[] {
  return rates
    .filter((r) => r.active)
    .map((r) => {
      const free =
        r.freeAboveCents !== null && subtotalCents >= r.freeAboveCents;
      return {
        id: r.id,
        name: r.name,
        priceCents: free ? 0 : r.priceCents,
        baseCents: r.priceCents,
        currency: r.currency,
        free,
        minDeliveryDays: r.minDeliveryDays,
        maxDeliveryDays: r.maxDeliveryDays,
      };
    })
    .sort((a, b) => a.priceCents - b.priceCents || a.baseCents - b.baseCents);
}

/** Active rates for a zone. */
export function ratesForZone(zoneId: string): Promise<ShippingRate[]> {
  return db
    .select()
    .from(shippingRates)
    .where(
      and(eq(shippingRates.zoneId, zoneId), eq(shippingRates.active, true)),
    );
}
