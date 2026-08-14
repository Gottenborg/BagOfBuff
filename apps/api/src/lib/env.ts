/**
 * Runtime environment configuration.
 *
 * DATABASE_URL should be the Supabase Postgres connection string. Use the
 * connection pooler URL (port 6543) in serverless/edge contexts; the pooler
 * requires `prepare: false` on the postgres.js client (see db/index.ts).
 */
export const env = {
  DATABASE_URL:
    process.env.DATABASE_URL ?? "postgres://localhost:5432/bagofbuff",
  PORT: Number(process.env.PORT ?? 3001),
  // Comma-separated list of allowed browser origins (shop + admin).
  CORS_ORIGINS: (
    process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3002"
  )
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  // Supabase project URL, e.g. https://<ref>.supabase.co — used to verify
  // auth JWTs against the project's JWKS. Empty disables auth (all protected
  // routes return 401).
  SUPABASE_URL: (process.env.SUPABASE_URL ?? "").replace(/\/$/, ""),

  // --- Stripe (checkout + webhooks) ---------------------------------------
  // Secret API key (sk_test_… / sk_live_…). Empty disables checkout: the
  // session endpoint returns 503 and the webhook 503, so the app still boots
  // and every other route works without Stripe configured.
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "",
  // Signing secret for the checkout webhook endpoint (whsec_…). Empty means
  // incoming webhooks cannot be verified and are rejected.
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  // Where Stripe redirects after the hosted checkout. `{CHECKOUT_SESSION_ID}`
  // is substituted by Stripe on success so the confirmation page can look the
  // order up.
  CHECKOUT_SUCCESS_URL:
    process.env.CHECKOUT_SUCCESS_URL ??
    "http://localhost:3000/checkout/success?session_id={CHECKOUT_SESSION_ID}",
  CHECKOUT_CANCEL_URL:
    process.env.CHECKOUT_CANCEL_URL ?? "http://localhost:3000/checkout",

  // --- Resend (order confirmation emails) ---------------------------------
  // API key (re_…). Empty makes email a logged no-op, so checkout still works
  // in local/dev without an email provider.
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? "",
  // From address for transactional email. Must be a verified Resend sender.
  ORDER_FROM_EMAIL: process.env.ORDER_FROM_EMAIL ?? "Bag of Buff <orders@bagofbuff.com>",

  // --- Company identity (invoices) ----------------------------------------
  // Printed on every invoice. A Danish invoice without a CVR number is not
  // valid, so invoice issuing refuses until these are set rather than emitting
  // a document that looks complete and isn't.
  COMPANY_NAME: process.env.COMPANY_NAME ?? "",
  COMPANY_ADDRESS: process.env.COMPANY_ADDRESS ?? "",
  COMPANY_CVR: process.env.COMPANY_CVR ?? "",
  COMPANY_EMAIL: process.env.COMPANY_EMAIL ?? "hello@bagofbuff.com",
} as const;
