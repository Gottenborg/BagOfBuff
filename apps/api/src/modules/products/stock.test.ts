import { describe, expect, test } from "bun:test";
import { MANUAL_STOCK_REASONS, STOCK_REASONS } from "./stock.service";

/**
 * Stock ledger rules.
 *
 * A ledger is only worth having if it explains the balance, so the properties
 * that matter are: every change is recorded, the recorded changes sum to the
 * balance, and a disagreement is visible rather than silently absorbed.
 */

/** Mirrors the clamped balance update in moveStock. */
function apply(stock: number, delta: number): number {
  return Math.max(stock + delta, 0);
}

/** Mirrors `reconcile`. */
function unexplained(stock: number, movements: number[]): number {
  return stock - movements.reduce((a, b) => a + b, 0);
}

describe("applying a movement", () => {
  test("receiving adds and selling removes", () => {
    expect(apply(10, 24)).toBe(34);
    expect(apply(34, -2)).toBe(32);
  });

  test("the balance never goes negative", () => {
    // A negative count is never true of a shelf, and allowing it would hide the
    // real error behind a number that looks precise.
    expect(apply(3, -10)).toBe(0);
  });

  test("a sequence of movements ends where the arithmetic says", () => {
    const deltas = [50, -2, -1, 12, -3];
    let stock = 0;
    for (const d of deltas) stock = apply(stock, d);
    expect(stock).toBe(56);
    expect(unexplained(stock, deltas)).toBe(0);
  });
});

describe("reconciliation", () => {
  test("a fully recorded product has nothing unexplained", () => {
    expect(unexplained(56, [50, -2, -1, 12, -3])).toBe(0);
  });

  test("stock that predates the ledger shows as unexplained", () => {
    // Expected, not a bug: the opening balance was never a movement.
    expect(unexplained(40, [])).toBe(40);
  });

  test("a direct database edit shows up as a discrepancy", () => {
    // The whole point — the number changed without a reason being recorded.
    expect(unexplained(37, [40, -3, -1])).toBe(1);
  });

  test("a count correction brings them back into line", () => {
    const deltas = [40, -3, -1];
    const corrected = [...deltas, 1];
    expect(unexplained(37, corrected)).toBe(0);
  });
});

describe("reasons", () => {
  test("sales and returns cannot be recorded by hand", () => {
    // They are written by the order flow; letting someone enter one directly
    // would put movements in the ledger with no order behind them.
    expect(MANUAL_STOCK_REASONS).not.toContain("sale");
    expect(MANUAL_STOCK_REASONS).not.toContain("return");
  });

  test("receiving a delivery is a manual reason", () => {
    expect(MANUAL_STOCK_REASONS).toContain("received");
  });

  test("every manual reason is a real reason", () => {
    for (const r of MANUAL_STOCK_REASONS) {
      expect(STOCK_REASONS).toContain(r);
    }
  });
});
