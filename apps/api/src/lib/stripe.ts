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
