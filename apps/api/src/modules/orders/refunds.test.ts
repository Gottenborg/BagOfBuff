import { describe, expect, test } from "bun:test";

/**
 * Refund arithmetic, isolated from Stripe and the database.
 *
 * The expensive mistake is refunding more than was captured — over a partial
 * refund, or by racing two refunds at once — so the remaining balance is always
 * derived from what has already been refunded rather than trusted from input.
 * These assert that rule directly.
 */

/** Mirrors the outstanding-balance rule in refunds.service. */
function outstanding(capturedCents: number, refundedCents: number): number {
  return capturedCents - refundedCents;
}

function isRefundAllowed(
  capturedCents: number,
  alreadyRefundedCents: number,
  requestedCents: number | null,
): { allowed: boolean; amount: number } {
  const remaining = outstanding(capturedCents, alreadyRefundedCents);
  if (remaining <= 0) return { allowed: false, amount: 0 };
  const amount = requestedCents ?? remaining;
  if (!Number.isInteger(amount) || amount <= 0) return { allowed: false, amount };
  if (amount > remaining) return { allowed: false, amount };
  return { allowed: true, amount };
}

describe("refund amount rules", () => {
  test("omitting an amount refunds everything outstanding", () => {
    expect(isRefundAllowed(22400, 0, null)).toEqual({
      allowed: true,
      amount: 22400,
    });
  });

  test("a partial refund leaves the rest outstanding", () => {
    const first = isRefundAllowed(22400, 0, 10000);
    expect(first.allowed).toBe(true);
    // A second refund can only take what is left.
    expect(isRefundAllowed(22400, 10000, null).amount).toBe(12400);
  });

  test("refunding more than remains is rejected", () => {
    expect(isRefundAllowed(22400, 10000, 12401).allowed).toBe(false);
    expect(isRefundAllowed(22400, 0, 22401).allowed).toBe(false);
  });

  test("a fully refunded order cannot be refunded again", () => {
    expect(isRefundAllowed(22400, 22400, null).allowed).toBe(false);
    expect(isRefundAllowed(22400, 22400, 100).allowed).toBe(false);
  });

  test("two partial refunds cannot exceed the captured total", () => {
    const captured = 22400;
    let refunded = 0;
    const a = isRefundAllowed(captured, refunded, 20000);
    expect(a.allowed).toBe(true);
    refunded += a.amount;
    // The second attempt sees the first, so the pair cannot overshoot.
    const b = isRefundAllowed(captured, refunded, 5000);
    expect(b.allowed).toBe(false);
    expect(refunded).toBeLessThanOrEqual(captured);
  });

  test("zero and negative amounts are rejected", () => {
    expect(isRefundAllowed(22400, 0, 0).allowed).toBe(false);
    expect(isRefundAllowed(22400, 0, -500).allowed).toBe(false);
  });

  test("non-integer amounts are rejected (money is minor units)", () => {
    expect(isRefundAllowed(22400, 0, 100.5).allowed).toBe(false);
  });
});

describe("order status after refunding", () => {
  /** Mirrors applyRefundToOrder's rule. */
  const isFullyRefunded = (captured: number, refunded: number) =>
    captured > 0 && refunded >= captured;

  test("a full refund marks the order refunded", () => {
    expect(isFullyRefunded(22400, 22400)).toBe(true);
  });

  test("a partial refund leaves the order paid", () => {
    expect(isFullyRefunded(22400, 10000)).toBe(false);
  });

  test("an order with no captured total is never 'fully refunded'", () => {
    expect(isFullyRefunded(0, 0)).toBe(false);
  });
});
