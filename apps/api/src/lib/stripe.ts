import Stripe from "stripe";
import { env } from "./env";

/**
 * Lazily-constructed Stripe client. Built on first use so an unset
 * STRIPE_SECRET_KEY doesn't throw at import time (mirrors the JWKS handling in
 * `lib/auth`). Returns `null` when Stripe is not configured, and callers turn
 * that into a 503 — the rest of the API keeps working without Stripe.
 */
let stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  if (!stripe) {
    stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      // Pin the API version so upgrades of the SDK don't silently change wire
      // behaviour; bump deliberately when adopting new Stripe features.
      apiVersion: "2026-07-29.dahlia",
      appInfo: { name: "Bag of Buff", url: "https://bagofbuff.com" },
    });
  }
  return stripe;
}

/** True when Stripe is configured and checkout can run. */
export function isStripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

/** True when the configured key charges real cards. */
export function isLiveMode(): boolean {
  return env.STRIPE_SECRET_KEY.startsWith("sk_live_");
}

/**
 * The webhook events the API acts on (see checkout.routes' switch).
 *
 * Kept here so the setup checker can compare the endpoint's subscription
 * against what the code actually handles — a missing event doesn't fail
 * anything loudly, it just means orders quietly never get fulfilled.
 */
export const REQUIRED_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.expired",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "refund.created",
  "refund.updated",
] as const;

/** A redirect target that would strand a real buyer on their own machine. */
function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
}

/**
 * Why the current config would mistreat a paying customer, if it would.
 *
 * The dangerous combination is a live key with the development redirect URLs
 * still in place: the charge succeeds and the buyer is then sent to a page on
 * their own machine, so they see a browser error instead of a confirmation and
 * we look like we took their money and vanished.
 */
export function checkoutConfigProblem(): string | null {
  if (!isStripeConfigured()) return null;
  const local = [
    ["CHECKOUT_SUCCESS_URL", env.CHECKOUT_SUCCESS_URL],
    ["CHECKOUT_CANCEL_URL", env.CHECKOUT_CANCEL_URL],
  ].filter(([, url]) => isLocalUrl(url!));
  if (local.length === 0) return null;
  return `${local.map(([name]) => name).join(" and ")} point at localhost, so buyers would be redirected to their own machine after paying.`;
}
