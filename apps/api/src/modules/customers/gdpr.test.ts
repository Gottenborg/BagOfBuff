import { describe, expect, test } from "bun:test";
import { isErased } from "./gdpr.service";

/**
 * Erasure rules.
 *
 * The failure modes point in opposite directions and both are serious: erasing
 * too little leaves personal data after a legal request to remove it, and
 * erasing too much destroys accounting records we are required to keep for five
 * years. What survives is therefore as much the specification as what goes.
 */

/** Mirrors the field selection in eraseCustomer. */
function eraseOrder(order: Record<string, unknown>): Record<string, unknown> {
  return {
    ...order,
    email: null,
    shipName: "[erased]",
    shipLine1: "[erased]",
    shipLine2: null,
    shipCity: "[erased]",
    shipPostalCode: "[erased]",
  };
}

const order = {
  id: "abc",
  email: "buyer@example.com",
  shipName: "Mark Gottenborg",
  shipLine1: "Nørrebrogade 1",
  shipLine2: "2. th",
  shipCity: "København",
  shipPostalCode: "2200",
  shipCountry: "DK",
  totalCents: 29800,
  taxCents: 5960,
  currency: "DKK",
  createdAt: "2026-08-14",
};

describe("what erasure removes", () => {
  const erased = eraseOrder(order);

  test("identifying fields are gone", () => {
    expect(erased.email).toBeNull();
    expect(erased.shipName).not.toBe("Mark Gottenborg");
    expect(erased.shipLine1).not.toContain("Nørrebrogade");
    expect(erased.shipCity).not.toBe("København");
    expect(erased.shipPostalCode).not.toBe("2200");
  });

  test("fields are overwritten, not blanked", () => {
    // A null address is indistinguishable from an order that never had one,
    // and someone would eventually try to "fix" it.
    expect(erased.shipName).toBe("[erased]");
    expect(erased.shipLine1).toBe("[erased]");
  });
});

describe("what erasure must keep", () => {
  const erased = eraseOrder(order);

  test("the financial record is untouched", () => {
    // Bookkeeping law requires five-year retention; art. 17(3)(b) exempts it.
    expect(erased.totalCents).toBe(29800);
    expect(erased.taxCents).toBe(5960);
    expect(erased.currency).toBe("DKK");
    expect(erased.createdAt).toBe("2026-08-14");
  });

  test("the ship-to country survives", () => {
    // It carries no identity but decides the VAT treatment — removing it would
    // corrupt the tax record we are obliged to keep.
    expect(erased.shipCountry).toBe("DK");
  });

  test("the order id survives, so the invoice still refers to something", () => {
    expect(erased.id).toBe("abc");
  });
});

describe("isErased", () => {
  test("recognises an erased order", () => {
    expect(isErased(eraseOrder(order) as never)).toBe(true);
  });

  test("an order that merely lacks an email is not erased", () => {
    // Pending checkouts have no email yet; they are not erasure requests.
    expect(isErased({ email: null, shipName: null })).toBe(false);
  });

  test("an ordinary order is not erased", () => {
    expect(isErased(order)).toBe(false);
  });
});

describe("when erasure must be refused", () => {
  /** Mirrors the active-subscription guard. */
  const blocked = (statuses: string[]) =>
    statuses.some(
      (s) => s === "active" || s === "trialing" || s === "past_due",
    );

  test("an active subscription blocks erasure", () => {
    // Otherwise we keep billing someone we can no longer identify or contact.
    expect(blocked(["active"])).toBe(true);
    expect(blocked(["past_due"])).toBe(true);
  });

  test("cancelled subscriptions do not block", () => {
    expect(blocked(["canceled", "canceled"])).toBe(false);
  });
});
