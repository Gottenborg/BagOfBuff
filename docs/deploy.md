# Deploying to Fly.io

Three Fly apps, all in **`fra` (Frankfurt)** to keep data in the EU alongside
Supabase:

| Fly app | Source | Runtime | Domain |
| --- | --- | --- | --- |
| `bagofbuff-api` | `apps/api` | Bun / Elysia | `api.bagofbuff.com` |
| `bagofbuff-shop` | `apps/shop` | Node / Nitro (SSR) | `bagofbuff.com`, `www.` |
| `bagofbuff-admin` | `apps/admin` | Node / Nitro (SSR) | `admin.bagofbuff.com` |

Postgres stays on **Supabase** — no Fly Postgres needed. Config lives at the repo
root: `Dockerfile.{api,shop,admin}` + `fly.{api,shop,admin}.toml`.

> **Runtime secrets vs. build args.** The API reads its config at runtime, so it
> uses `fly secrets`. The storefront/admin are Vite apps: `VITE_*` values are
> **inlined at build time**, so they are passed as `--build-arg` on
> `fly deploy`, not as secrets.

If you created the apps under different names, update the `app = "…"` line in
each `fly.*.toml`.

## 1. Apps (once)

```bash
fly apps create bagofbuff-api
fly apps create bagofbuff-shop
fly apps create bagofbuff-admin
```

## 2. API secrets

```bash
fly secrets set --app bagofbuff-api \
  DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres" \
  STRIPE_SECRET_KEY="sk_live_…" \
  STRIPE_WEBHOOK_SECRET="whsec_…" \
  RESEND_API_KEY="re_…" \
  ORDER_FROM_EMAIL="Bag of Buff <orders@bagofbuff.com>" \
  CHECKOUT_SUCCESS_URL="https://bagofbuff.com/checkout/success?session_id={CHECKOUT_SESSION_ID}" \
  CHECKOUT_CANCEL_URL="https://bagofbuff.com/checkout"
```

`SUPABASE_URL` and `CORS_ORIGINS` are already in `fly.api.toml` (not secret). The
app boots without Stripe/Resend keys — those endpoints just return 503 until set,
so you can deploy first and add keys later.

## 3. Deploy

```bash
# API
fly deploy --config fly.api.toml

# Storefront (public build config as build args)
fly deploy --config fly.shop.toml \
  --build-arg VITE_API_URL=https://api.bagofbuff.com \
  --build-arg VITE_PLAUSIBLE_DOMAIN=bagofbuff.com

# Back office
fly deploy --config fly.admin.toml \
  --build-arg VITE_API_URL=https://api.bagofbuff.com \
  --build-arg VITE_SUPABASE_URL=https://sumxigmxbtickbfkzrxf.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=<anon-key>
```

Each app is now live on its `*.fly.dev` URL — smoke-test before touching DNS:

```bash
curl https://bagofbuff-api.fly.dev/health   # -> {"status":"ok"}
```

## 4. Domains + TLS

```bash
fly certs add api.bagofbuff.com   --app bagofbuff-api
fly certs add bagofbuff.com       --app bagofbuff-shop
fly certs add www.bagofbuff.com   --app bagofbuff-shop
fly certs add admin.bagofbuff.com --app bagofbuff-admin
```

Then add DNS records at your registrar:

- **Subdomains** `api`, `www`, `admin` → `CNAME` → `<app>.fly.dev`
  (e.g. `api` → `bagofbuff-api.fly.dev`).
- **Apex** `bagofbuff.com` → the `A` / `AAAA` records printed by
  `fly certs show bagofbuff.com --app bagofbuff-shop` (Fly's anycast IPs).

Certificates issue automatically once DNS resolves (usually minutes). Check with
`fly certs show <domain> --app <app>`.

## 5. Post-deploy wiring

- **Stripe webhook** → Dashboard → Developers → Webhooks → add
  `https://api.bagofbuff.com/checkout/webhook`, listening for:
  `checkout.session.completed`, `checkout.session.expired`, `invoice.paid`,
  `invoice.payment_failed`, `customer.subscription.updated`,
  `customer.subscription.deleted`. Put the signing secret it gives you into
  `STRIPE_WEBHOOK_SECRET` (step 2).
- **Stripe Tax** → enable it and set an origin address, or VAT won't calculate.
- **Resend** → verify the `bagofbuff.com` sending domain (add its DKIM records to
  DNS) so order/subscription emails deliver.
- **CORS** → `fly.api.toml` already allows the three production origins; if you
  add domains, update `CORS_ORIGINS` and redeploy.

## Migrations

Schema changes are applied to Supabase directly (`bun run db:migrate` against
`DATABASE_URL`, or via the Supabase dashboard) — they are **not** part of the Fly
deploy. Migrations `0000`–`0007` are already applied.

## Redeploys

Re-run the relevant `fly deploy …` command. For the Vite apps, always pass the
same `--build-arg` values (they bake into the bundle). CI (build + type-check +
lint + test) gates every PR before it reaches the deploy branch.
