import { app } from "./app";
import { env } from "./lib/env";
import { checkoutConfigProblem, isLiveMode, isStripeConfigured } from "./lib/stripe";

app.listen(env.PORT);

console.log(`🦊 Bag of Buff API running at http://localhost:${env.PORT}`);
console.log(`📖 OpenAPI docs at http://localhost:${env.PORT}/openapi`);

// Say what payment configuration is actually in force. A silent boot is how a
// deployment ends up running without Stripe, or in test mode, without anyone
// noticing until a customer tries to pay.
if (!isStripeConfigured()) {
  console.log("💳 Stripe: not configured — checkout and refunds return 503.");
} else {
  console.log(`💳 Stripe: ${isLiveMode() ? "LIVE — charging real cards" : "test mode"}`);
  const problem = checkoutConfigProblem();
  if (problem) console.warn(`⚠️  Checkout redirect: ${problem}`);
  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.warn(
      "⚠️  STRIPE_WEBHOOK_SECRET is unset — webhooks are rejected, so paid orders never get fulfilled.",
    );
  }
}
