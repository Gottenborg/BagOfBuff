# Back of Buff

Monorepo for the Bag of Buff webshop — a physical-product store with
subscriptions, built EU-first. Managed with [Turborepo](https://turborepo.dev)
and [Bun](https://bun.sh).

## Architecture

One authoritative backend, two frontends, sharing types through the monorepo.

| Workspace | Stack | Role |
|---|---|---|
| `apps/api` | Elysia + Drizzle + postgres.js + OpenAPI (Bun) | The brain: products, orders, subscriptions, Stripe webhooks, fulfillment |
| `apps/shop` | TanStack Start (**SSR**) + TanStack Query + Tailwind v4 | Customer storefront (bagofbuff.com) — SSR for SEO + live data |
| `apps/admin` | TanStack Start (**SPA**) + TanStack Query + Tailwind v4 | Internal back office — catalogue + order management |
| `packages/api-client` | openapi-typescript + openapi-fetch | Typed API client generated from the API's OpenAPI spec, shared by both frontends |
| `packages/ui` | React + Tailwind (clsx + tailwind-merge) | Shared UI components |
| `packages/eslint-config`, `packages/typescript-config` | — | Shared configs |

### Data flow

`apps/api` emits an OpenAPI document (`apps/api/openapi.json`). `packages/api-client`
generates TypeScript types from it (`bun run --filter @repo/api-client generate`),
so the storefront and back office both consume the API through one type-safe
client. **The API is the single source of truth** — the frontends never touch
Postgres directly.

## Planned infrastructure

- **Supabase** (EU region) — Postgres, Auth, and Storage. Used as plain Postgres
  via Drizzle (not `supabase-js`) to stay portable.
- **Fly.io** (EU) — hosts the API and the SSR storefront as Bun containers; the
  admin builds to a static SPA shell.
- **Stripe** — Checkout + Billing + Tax for payments, subscriptions, and EU VAT
  (physical goods, so Stripe is merchant-enabler and we file VAT OSS).

## Getting started

```sh
bun install

# Point apps/api at a database (see apps/api/.env.example)
cp apps/api/.env.example apps/api/.env

bun run dev          # run all apps in dev
```

Default dev ports: API `3001`, storefront `3000`, admin `3002`.

## Common commands

```sh
bun run build         # build all workspaces
bun run check-types   # type-check everything
bun run lint          # lint (where configured)

# Regenerate the typed API client after changing API routes:
bun run --filter @repo/api openapi:export
bun run --filter @repo/api-client generate

# Database (from apps/api):
bun run --filter @repo/api db:generate   # create a migration from the schema
bun run --filter @repo/api db:migrate    # apply migrations
bun run --filter @repo/api db:seed       # seed the launch product (idempotent)
```

### Provisioning the database (Supabase)

1. Create a Supabase project in an **EU region** (e.g. Frankfurt).
2. Copy the **connection pooler** URL (port 6543) into `apps/api/.env` as
   `DATABASE_URL` — the pooler needs `prepare: false`, which the client already
   sets.
3. Apply the schema and seed:
   ```sh
   bun run --filter @repo/api db:migrate
   bun run --filter @repo/api db:seed
   ```

The initial migration (`apps/api/drizzle/0000_*.sql`) is committed, so
`db:migrate` is all that's needed on a fresh database.

### Authentication

The API verifies Supabase Auth JWTs against the project's JWKS (set
`SUPABASE_URL` in `apps/api/.env`). Authorization for the back office lives in
our own `admins` table (keyed by Supabase user id), so it stays portable.

To grant admin access, add the user's Supabase id to `admins`:

```sql
insert into admins (user_id, email) values ('<supabase-user-uuid>', '<email>');
```

Protected product write routes (`POST/PATCH/DELETE /products`) require an admin
bearer token; `GET /auth/me` returns the current user and whether they're an admin.

## Deployment

Both server apps deploy to Fly.io from the repo root:

```sh
fly deploy --config apps/api/fly.toml  --dockerfile apps/api/Dockerfile
fly deploy --config apps/shop/fly.toml --dockerfile apps/shop/Dockerfile
```

The admin app builds to a static SPA (`apps/admin/.output/public`, with
`_shell.html` as the entry) and can be served from any static host or CDN.
