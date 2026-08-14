import { describe, expect, test } from "bun:test";

/**
 * What gets written to an order's history, isolated from the database.
 *
 * The failure mode of an audit log isn't crashing — it's becoming useless. Two
 * ways that happens: recording "changes" that changed nothing (so the real
 * events drown), and missing a change that did happen (so the log lies by
 * omission). These pin both rules.
 */

/** Mirrors the fulfillment/tracking change detection in orders.routes. */
function changedFields(
  current: { fulfillmentStatus: string; trackingCarrier: string | null; trackingNumber: string | null },
  body: { fulfillmentStatus?: string; trackingCarrier?: string | null; trackingNumber?: string | null },
): string[] {
  const events: string[] = [];
  const next = body.fulfillmentStatus ?? current.fulfillmentStatus;
  if (next !== current.fulfillmentStatus) events.push("fulfillment.changed");

  const carrierChanged =
    body.trackingCarrier !== undefined &&
    body.trackingCarrier !== current.trackingCarrier;
  const numberChanged =
    body.trackingNumber !== undefined &&
    body.trackingNumber !== current.trackingNumber;
  if (carrierChanged || numberChanged) events.push("tracking.changed");
  return events;
}

const order = {
  fulfillmentStatus: "new",
  trackingCarrier: null,
  trackingNumber: null,
};

describe("what counts as a change worth recording", () => {
  test("advancing fulfillment is recorded", () => {
    expect(changedFields(order, { fulfillmentStatus: "packed" })).toEqual([
      "fulfillment.changed",
    ]);
  });

  test("re-submitting the current status records nothing", () => {
    // The UI disables the current step, but a double-click or a retried
    // request must not add a line saying nothing happened.
    expect(changedFields(order, { fulfillmentStatus: "new" })).toEqual([]);
  });

  test("an omitted field is 'not provided', not 'cleared'", () => {
    // A request that only advances fulfillment must not claim tracking changed.
    const shipped = {
      fulfillmentStatus: "packed",
      trackingCarrier: "PostNord",
      trackingNumber: "ABC123",
    };
    expect(changedFields(shipped, { fulfillmentStatus: "shipped" })).toEqual([
      "fulfillment.changed",
    ]);
  });

  test("clearing tracking is a change, and is distinguishable from omitting it", () => {
    const shipped = {
      fulfillmentStatus: "shipped",
      trackingCarrier: "PostNord",
      trackingNumber: "ABC123",
    };
    expect(changedFields(shipped, { trackingNumber: null })).toEqual([
      "tracking.changed",
    ]);
    expect(changedFields(shipped, {})).toEqual([]);
  });

  test("saving identical tracking records nothing", () => {
    const shipped = {
      fulfillmentStatus: "shipped",
      trackingCarrier: "PostNord",
      trackingNumber: "ABC123",
    };
    expect(
      changedFields(shipped, {
        trackingCarrier: "PostNord",
        trackingNumber: "ABC123",
      }),
    ).toEqual([]);
  });

  test("both changing in one request records both", () => {
    expect(
      changedFields(order, {
        fulfillmentStatus: "shipped",
        trackingNumber: "XYZ",
      }),
    ).toEqual(["fulfillment.changed", "tracking.changed"]);
  });
});

describe("refund status transitions", () => {
  /** Mirrors the redelivery guard in syncRefundFromStripe. */
  const shouldRecord = (from: string, to: string) => from !== to;

  test("a redelivered webhook with no change records nothing", () => {
    // Stripe redelivers; the log must not gain a line each time.
    expect(shouldRecord("succeeded", "succeeded")).toBe(false);
  });

  test("settling and failing are both recorded", () => {
    expect(shouldRecord("pending", "succeeded")).toBe(true);
    expect(shouldRecord("pending", "failed")).toBe(true);
  });
});
