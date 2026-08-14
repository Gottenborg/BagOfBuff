# Stripe setup

Stripe handles payment, VAT calculation, subscriptions and refunds. The API
boots fine without it — every Stripe-backed route returns 503 — so the shop can
run unpaid while this is configured.

Do the whole thing in **test mode** first. The only difference when going live is
which keys you paste; the steps are identical.

## What the code expects

| Variable | Where it goes | Without it |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | GitHub secret | Checkout, subscriptions and refunds return 503 |
| `STRIPE_WEBHOOK_SECRET` | GitHub secret | Webhooks are rejected — **paid orders stay `pending` for ever** |
| `CHECKOUT_SUCCESS_URL` / `CHECKOUT_CANCEL_URL` | `fly.api.toml` (not secret) | Buyers are redirected to `localhost` after paying |

The deploy workflow pushes the two secrets to Fly on every deploy, so GitHub is
the single place to change them.

## 1. Keys

Stripe → **Developers → API keys** → *Secret key* → Reveal.

Verify it before it costs a deploy cycle:

```bash
cd apps/api
STRIPE_SECRET_KEY="sk_test_…" bun run stripe:check
```

This calls Stripe for real and checks the things that fail silently: whether the
key works, whether Stripe Tax has a registration, and whether the webhook
endpoint is subscribed to the events the code actually handles. It never prints
the key.

Then add it as a repository secret: **Settings → Secrets and variables →
Actions → New repository secret**, named `STRIPE_SECRET_KEY`.

## 2. Webhook endpoint

This is the part that fails quietly. Stripe Checkout redirects the buyer back to
us, but the *order* is only marked paid when the webhook arrives — no webhook,
no fulfilled orders, no confirmation emails.

Stripe → **Developers → Webhooks → Add endpoint**

- **URL**: `https://bagofbuff-api.fly.dev/checkout/webhook`
- **Events** — all eight, or the corresponding orders/billing groups:
  - `checkout.session.completed` — marks the order paid, sends the confirmation
  - `checkout.session.expired` — releases an abandoned checkout
  - `invoice.paid` — spawns each subscription cycle's fulfillment order
  - `invoice.payment_failed` — flags a failing subscription
  - `customer.subscription.updated`, `customer.subscription.deleted`
  - `refund.created`, `refund.updated` — so refunds issued in the Stripe
    dashboard also show up in the back office

Then open the endpoint, reveal its **Signing secret** (`whsec_…`), and add it as
the `STRIPE_WEBHOOK_SECRET` repository secret.

The signing secret is per-endpoint: a separate live endpoint has a *different*
one. Swapping keys without swapping this is the usual going-live mistake.

The API scales to zero, so the first webhook after an idle period cold-starts the
machine (1–2 s). Stripe's retry policy covers that.

## 3. Stripe Tax

Storefront prices are VAT-inclusive and Checkout is created with
`automatic_tax: { enabled: true }`, which splits the VAT out by ship-to country.

Stripe → **Tax** → complete the origin address, then **Registrations** → add
**Denmark**. Without a registration Stripe calculates **0 % VAT** and you
under-charge on every sale while everything looks like it worked. Add further
countries as you cross the EU OSS threshold (€10,000/year of cross-border B2C
sales).

`bun run stripe:check` fails on a live key with no registrations, for this reason.

## 4. Going live

1. Finish Stripe's account activation (bank details, business info).
2. Swap both secrets for their live values (`sk_live_…`, plus the signing secret
   of a **new** live-mode webhook endpoint — test-mode endpoints do not carry
   over).
3. Re-run `stripe:check` with the live key.
4. Push, or run the Deploy workflow manually.

The API refuses to create a *live* checkout session while the redirect URLs
still point at localhost, and logs its Stripe mode at boot, so a half-configured
live deployment is visible rather than silent.

## Local development

```bash
# apps/api/.env
STRIPE_SECRET_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…      # from `stripe listen`, not the dashboard
```

Forward webhooks to the local API with the Stripe CLI:

```bash
stripe listen --forward-to localhost:3001/checkout/webhook
```

`stripe listen` prints its own signing secret — use that one locally. Test card:
`4242 4242 4242 4242`, any future expiry and CVC.
