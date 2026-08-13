# Deploying to Fly.io

Three Fly apps, all in **`fra` (Frankfurt)** to keep data in the EU alongside
Supabase:

| Fly app | Source | Runtime | Domain |
| --- | --- | --- | --- |
| `bagofbuff-api` | `apps/api` | Bun / Elysia | `api.bagofbuff.com` |
| `bagofbuff-shop` | `apps/shop` | Bun / Nitro (SSR) | `bagofbuff.com`, `www.` |
| `bagofbuff-admin` | `apps/admin` | Bun / Nitro (SSR) | `admin.bagofbuff.com` |

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

## Continuous deployment (from Git)

`.github/workflows/deploy.yml` deploys all three apps automatically on every
push to the trunk branch (`claude/back-of-buff-monorepo-turbo-kw3k23`), and can
be run manually from the Actions tab. It verifies the build/type-check/lint/test
first, then uses Fly **remote builders** (no Docker in the runner).

One-time setup:

1. Create a deploy token:
   ```bash
   fly tokens create deploy -x 999999h
   ```
2. Add it as a GitHub repo secret named **`FLY_API_TOKEN`**
   (Settings → Secrets and variables → Actions → New repository secret).

The public `VITE_*` build values live in the workflow's `env:` block (they ship
to the browser, so they aren't secrets); update them there if the domain or
Supabase project changes.

### API runtime secrets (recommended: set them in GitHub)

Rather than running `fly secrets set` locally, add these as **GitHub repo
secrets** and the deploy workflow pushes them to Fly before deploying (staged,
so they apply with the deploy rather than causing an extra restart):

| GitHub secret | Purpose |
| --- | --- |
| `DATABASE_URL` | Supabase pooler connection string (port 6543) |
| `STRIPE_SECRET_KEY` | Stripe API key (optional until you take payments) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (optional) |
| `RESEND_API_KEY` | Transactional email (optional) |

Only the secrets you actually set are sent, so partial configuration is fine.
Setting them with `fly secrets set` directly still works and takes precedence
until the next deploy.

> **`DATABASE_URL` gotcha:** copy the URI verbatim from Supabase → Connect →
> Connection pooling (Transaction, 6543). If the password contains `@ # ? / % :`
> it must be percent-encoded, or the URL parses wrong and you get
> `password authentication failed`. A password of letters and digits avoids this.

**Check the string before you save it as a secret** — this takes seconds and
avoids a deploy cycle spent discovering it was wrong:

```bash
cd apps/api
DATABASE_URL="postgresql://…" bun run db:check
```

It inspects the URL for the mistakes that actually happen (placeholder left in,
un-encoded `@`/`#`, plain `postgres` username against the pooler, wrong port),
then makes a real connection and translates the driver error into the remedy.
It prints the user/host/port and the password's length — never the password.
Exit 0 means the string is good.

### Health gate

After deploying the API, the workflow polls `/health` and **fails the run** if
the API cannot reach Postgres. `/health` executes a real query, so a green
deploy now means the API is genuinely serving — not merely that the container
booted.

The Fly apps must already exist (`fly apps create …`) before the first run.

## Storefront on Cloudflare Pages (cheaper hosting)

To cut hosting cost, the **public storefront** can run on **Cloudflare Pages**
(free tier, commercial use allowed, edge SSR) instead of Fly.
`.github/workflows/deploy-cloudflare.yml` builds `apps/shop` with the Nitro
`cloudflare_pages` preset and deploys it to Pages on every push to trunk.

Split rationale:

- **Storefront → Cloudflare Pages.** SSR; builds cleanly for Cloudflare; gets the
  most benefit from free edge hosting.
- **Back office → stays on Fly.** It runs in SPA mode, whose shell-prerender step
  isn't compatible with the Cloudflare build. Low traffic, ~free at scale-to-zero.
- **API → stays on Fly.** Holds a Postgres TCP connection (not supported on
  Cloudflare Workers without Hyperdrive / a driver change).

One-time setup:

1. Create a Cloudflare API token with **Pages: Edit** permission, and note your
   **account ID**.
2. Add both as GitHub repo secrets: **`CLOUDFLARE_API_TOKEN`** and
   **`CLOUDFLARE_ACCOUNT_ID`**. The Pages project (`bagofbuff-shop`) is created
   on the first run.

The storefront is then served at `https://bagofbuff-shop.pages.dev` (already in
the API's `CORS_ORIGINS`). Point the apex/`www` DNS at Pages instead of Fly when
you move the custom domain. Once verified, you can drop the storefront from the
Fly deploy workflow and delete its Fly app.

## Redeploys

Push to trunk (CD handles it), trigger the **Deploy** workflow manually, or run
the relevant `fly deploy …` command locally. For the Vite apps, always pass the
same `--build-arg` values (they bake into the bundle). CI (build + type-check +
lint + test) gates every PR before it reaches the deploy branch.
