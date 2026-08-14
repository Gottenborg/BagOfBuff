import { afterEach, describe, expect, test } from "bun:test";
import { env } from "./env";
import { checkoutConfigProblem, isLiveMode } from "./stripe";

/**
 * The redirect guard.
 *
 * A live key with the development redirect URLs still in place is the one
 * misconfiguration that hurts a customer rather than us: the card is charged
 * and the browser is then sent to a page on their own machine, so it looks like
 * we took the money and disappeared. These pin the conditions under which the
 * guard fires.
 */

const original = {
  key: env.STRIPE_SECRET_KEY,
  success: env.CHECKOUT_SUCCESS_URL,
  cancel: env.CHECKOUT_CANCEL_URL,
};

// `env` is a frozen-looking const object but not actually frozen; assigning
// through a cast keeps the production shape read-only while letting the test
// drive it.
function setEnv(key: string, success: string, cancel: string) {
  const mutable = env as unknown as Record<string, string>;
  mutable.STRIPE_SECRET_KEY = key;
  mutable.CHECKOUT_SUCCESS_URL = success;
  mutable.CHECKOUT_CANCEL_URL = cancel;
}

afterEach(() => setEnv(original.key, original.success, original.cancel));

const LIVE = "sk_live_example";
const TEST = "sk_test_example";
const PROD_OK = "https://bagofbuff.com/checkout/success";
const PROD_CANCEL = "https://bagofbuff.com/checkout";
const LOCAL = "http://localhost:3000/checkout/success";

describe("checkoutConfigProblem", () => {
  test("says nothing when Stripe is not configured at all", () => {
    setEnv("", LOCAL, LOCAL);
    expect(checkoutConfigProblem()).toBeNull();
  });

  test("says nothing when the redirects are public URLs", () => {
    setEnv(LIVE, PROD_OK, PROD_CANCEL);
    expect(checkoutConfigProblem()).toBeNull();
  });

  test("flags a localhost success URL", () => {
    setEnv(LIVE, LOCAL, PROD_CANCEL);
    expect(checkoutConfigProblem()).toContain("CHECKOUT_SUCCESS_URL");
  });

  test("names both URLs when both are local", () => {
    setEnv(TEST, LOCAL, "http://127.0.0.1:3000/checkout");
    const problem = checkoutConfigProblem();
    expect(problem).toContain("CHECKOUT_SUCCESS_URL");
    expect(problem).toContain("CHECKOUT_CANCEL_URL");
  });

  test("a malformed URL is not reported as local", () => {
    // Nothing useful to say about it here, and Stripe rejects it on its own.
    setEnv(LIVE, "not-a-url", PROD_CANCEL);
    expect(checkoutConfigProblem()).toBeNull();
  });
});

describe("isLiveMode", () => {
  test("only sk_live_ keys charge real cards", () => {
    setEnv(LIVE, PROD_OK, PROD_CANCEL);
    expect(isLiveMode()).toBe(true);
    setEnv(TEST, PROD_OK, PROD_CANCEL);
    expect(isLiveMode()).toBe(false);
    setEnv("", PROD_OK, PROD_CANCEL);
    expect(isLiveMode()).toBe(false);
  });
});
