import { describe, expect, test } from "bun:test";

/**
 * Cancellation rules, isolated from Stripe and the database.
 *
 * The dangerous outcomes are cancelling something already in a courier's hands,
 * and cancelling a paid order without returning the money — the customer has
 * then paid for nothing and our records say the matter is closed.
 */

type Decision =
  | { allowed: true; refunds: number }
  | { allowed: false; reason: string };

function decideCancel(order: {
  status: string;
  fulfillmentStatus: string;
  totalCents: number;
  refundedCents: number;
}, refund: boolean): Decision {
  if (order.status === "canceled")
    return { allowed: false, reason: "already canceled" };
  if (order.fulfillmentStatus === "shipped")
    return { allowed: false, reason: "shipped" };

  const paid = order.status === "paid" || order.status === "fulfilled";
  const outstanding = order.totalCents - order.refundedCents;
  return {
    allowed: true,
    refunds: refund && paid && outstanding > 0 ? outstanding : 0,
  };
}

const pending = {
  status: "pending",
  fulfillmentStatus: "new",
  totalCents: 0,
  refundedCents: 0,
};
const paid = {
  status: "paid",
  fulfillmentStatus: "new",
  totalCents: 29800,
  refundedCents: 0,
};

describe("cancelling", () => {
  test("a shipped order cannot be cancelled", () => {
    // Once it's with the courier the correct path is a return, refunded
    // against a real shipment.
    const result = decideCancel({ ...paid, fulfillmentStatus: "shipped" }, true);
    expect(result).toEqual({ allowed: false, reason: "shipped" });
  });

  test("a packed order can still be stopped", () => {
    // Packed is ours; shipped is not.
    expect(decideCancel({ ...paid, fulfillmentStatus: "packed" }, true).allowed).toBe(
      true,
    );
  });

  test("cancelling a paid order refunds the whole outstanding balance", () => {
    expect(decideCancel(paid, true)).toEqual({ allowed: true, refunds: 29800 });
  });

  test("a partly refunded order only refunds what remains", () => {
    expect(decideCancel({ ...paid, refundedCents: 10000 }, true)).toEqual({
      allowed: true,
      refunds: 19800,
    });
  });

  test("a fully refunded order cancels without refunding again", () => {
    expect(decideCancel({ ...paid, refundedCents: 29800 }, true)).toEqual({
      allowed: true,
      refunds: 0,
    });
  });

  test("an unpaid order cancels with nothing to refund", () => {
    // Abandoned checkouts have taken no money.
    expect(decideCancel(pending, true)).toEqual({ allowed: true, refunds: 0 });
  });

  test("cancelling without refunding is allowed but takes no money back", () => {
    // Deliberate: goods swapped for a replacement order, say.
    expect(decideCancel(paid, false)).toEqual({ allowed: true, refunds: 0 });
  });

  test("cancelling twice is refused", () => {
    expect(decideCancel({ ...paid, status: "canceled" }, true).allowed).toBe(
      false,
    );
  });
});

describe("removing an administrator", () => {
  /** Mirrors the guards in admins.routes. */
  function canRemove(target: string, self: string, total: number): boolean {
    if (target === self) return false;
    if (total <= 1) return false;
    return true;
  }

  test("you cannot remove yourself", () => {
    // The classic way to lock yourself out mid-task.
    expect(canRemove("me", "me", 3)).toBe(false);
  });

  test("the last administrator cannot be removed", () => {
    // With none left, the only way back in is raw SQL.
    expect(canRemove("other", "me", 1)).toBe(false);
  });

  test("another administrator can be removed when others remain", () => {
    expect(canRemove("other", "me", 2)).toBe(true);
  });
});
