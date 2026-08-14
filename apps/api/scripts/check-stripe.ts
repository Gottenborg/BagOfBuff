/**
 * Validates the Stripe configuration before you commit it to a secret.
 *
 *   STRIPE_SECRET_KEY="sk_test_…" bun run stripe:check
 *   STRIPE_SECRET_KEY="sk_…" STRIPE_WEBHOOK_SECRET="whsec_…" bun run stripe:check
 *
 * Checkout fails in ways that are invisible until a customer hits them: a
 * webhook endpoint that isn't subscribed to `checkout.session.completed` looks
 * perfectly healthy while every paid order silently stays `pending`. This makes
 * a real API call for each check and reports what is missing.
 *
 * Exits 0 when checkout would work, 1 otherwise. Never prints the key.
 */
import Stripe from "stripe";
import { REQUIRED_WEBHOOK_EVENTS } from "../src/lib/stripe";

const key = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

if (!key) {
  console.error("✗ STRIPE_SECRET_KEY is not set.\n");
  console.error("  Pass it inline:");
  console.error('    STRIPE_SECRET_KEY="sk_test_…" bun run stripe:check');
  console.error("\n  Get it from Stripe → Developers → API keys → Secret key.");
  process.exit(1);
}

const problems: string[] = [];
const warnings: string[] = [];

// --- Static inspection ------------------------------------------------------

const live = key.startsWith("sk_live_");
if (!key.startsWith("sk_live_") && !key.startsWith("sk_test_")) {
  if (key.startsWith("pk_")) {
    problems.push(
      "That is a publishable key (pk_…). The API needs the secret key (sk_…), " +
        "which is revealed behind 'Reveal test key' in the dashboard.",
    );
  } else if (key.startsWith("rk_")) {
    warnings.push(
      "This is a restricted key (rk_…). It must grant write access to " +
        "Checkout Sessions, PaymentIntents, Refunds and Products.",
    );
  } else {
    problems.push(
      "That does not look like a Stripe secret key — it should start with sk_test_ or sk_live_.",
    );
  }
}
if (/\s/.test(key)) {
  problems.push("The key contains whitespace — it was probably copied with a line break.");
}

console.log(`Key:  ${key.slice(0, 8)}… (${key.length} chars)`);
console.log(`Mode: ${live ? "LIVE — real cards will be charged" : "test"}`);
console.log("");

if (problems.length > 0) {
  console.error("✗ Problems found:\n");
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2026-07-29.dahlia" });

// --- Live checks ------------------------------------------------------------

async function main(): Promise<number> {
  let failed = false;

  // 1. Does the key work at all, and on which account?
  try {
    // The account the key itself belongs to — no id, so this also proves the
    // key is usable rather than merely well-formed.
    const account = await stripe.accounts.retrieveCurrent();
    console.log("✓ Key accepted.");
    console.log(`  account  ${account.id}`);
    console.log(`  name     ${account.settings?.dashboard?.display_name ?? "(unnamed)"}`);
    console.log(`  country  ${account.country ?? "?"}`);
    if (account.charges_enabled === false) {
      console.log(
        "  ⚠️  charges are NOT enabled on this account — finish Stripe's onboarding before going live.",
      );
      failed = true;
    }
    console.log("");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Distinguish "the key is wrong" from "we never reached Stripe". Behind a
    // proxy the two look alike — a blocked CONNECT comes back as an HTML error
    // page, which the SDK reports as invalid JSON — and blaming the key for a
    // network fault sends you rotating credentials that were fine.
    const unreachable =
      err instanceof Stripe.errors.StripeConnectionError ||
      /Invalid JSON|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|tunnel|proxy|socket hang up|timed? ?out/i.test(
        message,
      );
    if (unreachable) {
      console.error("✗ Could not reach the Stripe API.\n");
      console.error(`  ${message}\n`);
      console.error("  The key was not checked — this is a network problem, not a");
      console.error("  credential problem. Check outbound access to api.stripe.com");
      console.error("  (corporate proxy, VPN, or firewall) and run this again.");
      return 1;
    }
    console.error("✗ Stripe rejected the key.\n");
    console.error(`  ${message}\n`);
    if (/Invalid API Key|No such/i.test(message)) {
      console.error("  Check for a truncated paste, or a key from a different account.");
    } else if (/expired|revoked/i.test(message)) {
      console.error("  This key has been revoked — roll a new one in the dashboard.");
    }
    return 1;
  }

  // 2. Stripe Tax is deliberately unused — VAT is calculated in-house (lib/vat)
  // because a Danish seller charges Danish VAT on every EU sale below the OSS
  // threshold. Report any registrations found, but never fail on their absence:
  // that is the expected state, not a misconfiguration.
  try {
    const registrations = await stripe.tax.registrations.list({
      status: "active",
      limit: 100,
    });
    if (registrations.data.length > 0) {
      const where = registrations.data.map((r) => r.country).sort().join(", ");
      console.log(`note: Stripe Tax registrations exist (${where}), but`);
      console.log("      automatic_tax is off — VAT comes from lib/vat instead.");
      console.log("");
    }
  } catch {
    // Restricted keys may lack the tax permission; nothing depends on this.
  }

  // 3. Webhook endpoints: the quiet failure mode.
  try {
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    const enabled = endpoints.data.filter((e) => e.status === "enabled");
    if (enabled.length === 0) {
      console.log("✗ No enabled webhook endpoint on this account.");
      console.log("   Paid orders stay `pending` for ever without one.");
      console.log("   Fix: Stripe → Developers → Webhooks → Add endpoint:");
      console.log("     https://bagofbuff-api.fly.dev/checkout/webhook");
      failed = true;
    } else {
      for (const e of enabled) {
        const all = e.enabled_events.includes("*");
        const missing = all
          ? []
          : REQUIRED_WEBHOOK_EVENTS.filter((ev) => !e.enabled_events.includes(ev));
        const ours = e.url.includes("/checkout/webhook");
        console.log(`${missing.length === 0 ? "✓" : "✗"} ${e.url}`);
        if (!ours) {
          console.log("   note: not our /checkout/webhook path — ignore if it belongs to something else.");
          continue;
        }
        if (missing.length > 0) {
          console.log(`   missing events: ${missing.join(", ")}`);
          console.log("   Those events are handled in code but never delivered.");
          failed = true;
        }
      }
    }
    console.log("");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`⚠️  Could not list webhook endpoints: ${message}\n`);
  }

  // 4. The signing secret is per-endpoint and easy to mix up with the key.
  if (!webhookSecret) {
    console.log("⚠️  STRIPE_WEBHOOK_SECRET not passed — not checked.");
    console.log(
      "   Without it the API rejects every webhook, so orders are never fulfilled.",
    );
    console.log(
      "   Get it from the endpoint's page → 'Signing secret' → Reveal.\n",
    );
  } else if (!webhookSecret.startsWith("whsec_")) {
    console.log("✗ STRIPE_WEBHOOK_SECRET should start with whsec_.");
    console.log("   It is the endpoint's signing secret, not an API key.\n");
    failed = true;
  } else {
    console.log("✓ STRIPE_WEBHOOK_SECRET looks like a signing secret.");
    console.log(
      "   (Only its shape can be checked here — Stripe has no endpoint to verify it.)\n",
    );
  }

  if (failed) {
    console.error("✗ Checkout would not work correctly with this configuration.");
    return 1;
  }
  console.log("✓ Stripe configuration is good.");
  return 0;
}

process.exit(await main());
