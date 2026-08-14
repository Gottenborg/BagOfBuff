import { describe, expect, test } from "bun:test";
import { formatInvoiceNumber } from "./invoices.service";

/**
 * Invoice numbering.
 *
 * Danish bookkeeping law requires an unbroken series, so the rules that matter
 * are: never derive the number from something mutable, never burn one without
 * issuing, and never reuse one.
 */

describe("formatInvoiceNumber", () => {
  test("pads so invoices sort and read consistently on paper", () => {
    expect(formatInvoiceNumber(1)).toBe("00001");
    expect(formatInvoiceNumber(42)).toBe("00042");
  });

  test("does not truncate once the series outgrows the padding", () => {
    expect(formatInvoiceNumber(123456)).toBe("123456");
  });
});

describe("which orders can be invoiced", () => {
  /** Mirrors the status gate in issueInvoice. */
  const invoiceable = (status: string) =>
    status === "paid" || status === "fulfilled" || status === "refunded";

  test("a paid order can be invoiced", () => {
    expect(invoiceable("paid")).toBe(true);
    expect(invoiceable("fulfilled")).toBe(true);
  });

  test("a refunded order keeps its invoice", () => {
    // The sale happened. A refund is corrected with a credit note, not by
    // pretending the invoice never existed.
    expect(invoiceable("refunded")).toBe(true);
  });

  test("unpaid and canceled orders cannot be invoiced", () => {
    // Invoicing an abandoned checkout would put a number into the series for a
    // sale that never occurred.
    expect(invoiceable("pending")).toBe(false);
    expect(invoiceable("canceled")).toBe(false);
  });
});

describe("allocation", () => {
  /** Mirrors max+1 under the advisory lock. */
  const next = (existing: number[]) =>
    (existing.length ? Math.max(...existing) : 0) + 1;

  test("the first invoice is number 1", () => {
    expect(next([])).toBe(1);
  });

  test("numbers continue from the highest issued", () => {
    expect(next([1, 2, 3])).toBe(4);
  });

  test("a deleted row does not cause reuse", () => {
    // Reusing 3 would mean two documents with one number. Continuing past the
    // maximum leaves a visible gap instead, which is auditable — silently
    // duplicating is not.
    expect(next([1, 2, 4])).toBe(5);
  });
});
