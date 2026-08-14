import { and, gte, ne, sql } from "drizzle-orm";
import { db } from "../../db";
import { orders } from "../../db/schema";
import { HOME_COUNTRY, isEuCountry } from "../../lib/vat";

/**
 * EU OSS threshold monitoring.
 *
 * We charge Danish VAT on all EU sales, which is correct only while
 * cross-border B2C sales stay under €10,000 in a calendar year. Cross that line
 * and every subsequent sale must carry the *destination* country's rate — and
 * the liability starts at the transaction that crosses it, not at the start of
 * the next year.
 *
 * A shop can pass €10,000 without anyone noticing, so this makes the position
 * checkable at any time and warns before the line rather than after.
 */

/** Council Directive 2006/112/EC art. 59c. */
export const OSS_THRESHOLD_EUR_CENTS = 1_000_000;

/** Warn from 80% so there's room to register before it matters. */
const WARN_AT = 0.8;

/**
 * DKK→EUR for threshold purposes only.
 *
 * The krone is pegged to the euro under ERM II at 7.46038 with a ±2.25% band,
 * so this is stable enough to measure a threshold against. It is never used to
 * price anything — prices per currency are stored, not converted.
 */
const DKK_PER_EUR = 7.46038;

export type OssStatus = {
  year: number;
  /** Cross-border EU B2C sales so far this year, in EUR cents. */
  crossBorderEurCents: number;
  thresholdEurCents: number;
  /** 0–1+, for a progress display. */
  ratio: number;
  /** True once destination rates become mandatory. */
  exceeded: boolean;
  /** True from 80%, so registration can happen before the crossing. */
  approaching: boolean;
};

export async function ossStatus(now: Date = new Date()): Promise<OssStatus> {
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  // Paid orders only — a pending checkout is not a sale. Shipping counts
  // toward the threshold: it is part of the consideration for the supply.
  const rows = await db
    .select({
      currency: orders.currency,
      country: orders.shipCountry,
      total: sql<number>`coalesce(sum(coalesce(${orders.totalCents}, ${orders.subtotalCents} + ${orders.shippingCents})), 0)`,
    })
    .from(orders)
    .where(
      and(
        gte(orders.createdAt, yearStart),
        ne(orders.status, "pending"),
        ne(orders.status, "canceled"),
      ),
    )
    .groupBy(orders.currency, orders.shipCountry);

  let crossBorderEurCents = 0;
  for (const row of rows) {
    const country = (row.country ?? "").toUpperCase();
    // Domestic sales and exports outside the EU don't count toward OSS.
    if (country === HOME_COUNTRY || !isEuCountry(country)) continue;
    const amount = Number(row.total ?? 0);
    crossBorderEurCents +=
      row.currency.toUpperCase() === "DKK"
        ? Math.round(amount / DKK_PER_EUR)
        : amount;
  }

  const ratio = crossBorderEurCents / OSS_THRESHOLD_EUR_CENTS;
  return {
    year: now.getUTCFullYear(),
    crossBorderEurCents,
    thresholdEurCents: OSS_THRESHOLD_EUR_CENTS,
    ratio,
    exceeded: crossBorderEurCents >= OSS_THRESHOLD_EUR_CENTS,
    approaching: ratio >= WARN_AT,
  };
}
