# Project status

Durable, chat-independent record of where the webshop build stands. Update this
alongside Linear so any new session can continue without relying on chat memory.

Working branch: `claude/back-of-buff-monorepo-turbo-kw3k23`
Linear project: **Setup Webshop** (team `BAG`)

## Issue status

| Issue | Title | Code | Linear |
|---|---|---|---|
| BAG-9  | Monorepo foundation (Turborepo + Bun) | ✅ pushed | ✅ Done |
| BAG-10 | Provision Supabase (EU) + Drizzle migrations | ✅ pushed | ✅ Done |
| BAG-11 | Product catalogue API (CRUD) | ✅ pushed | ✅ Done |
| BAG-12 | Authentication (Supabase JWT + admin gating) | ✅ pushed `2e23d53` | ⏳ **mark Done** |
| BAG-13 | Design system + brand integration | — not started | Todo |
| BAG-14 | Storefront: product pages + cart | ✅ pushed `e956b65` | ⏳ **mark Done** |
| BAG-15 | Back office: product management UI | ✅ pushed `bd0c02b` | ⏳ **mark Done** |
| BAG-16 | Back office: order & fulfillment | — (blocked by BAG-18) | Todo |
| BAG-17 | Shipping: addresses, zones & rates | — not started | Todo |
| BAG-18 | Stripe checkout + EU VAT (Stripe Tax) | — needs Stripe keys | Todo |
| BAG-19 | Subscriptions via Stripe Billing | — not started | Todo |
| BAG-20 | EU compliance | — not started | Todo |
| BAG-21 | Deploy to Fly.io + bagofbuff.com | — not started | Todo |
| BAG-22 | CI pipeline + ESLint | — not started | Todo |

## Pending reconciliation (do when connectors are available)

These are done in code but not yet reflected in Linear / the live DB, because the
Linear and Supabase MCP connectors kept dropping.

1. **Mark BAG-12, BAG-14, BAG-15 as Done** in Linear (commits above).
2. **Apply migration `0002`** (admins table + RLS) to the Supabase project and sync
   the Drizzle journal. It is committed at `apps/api/drizzle/0002_*.sql`; on a fresh
   DB `drizzle-kit migrate` applies it automatically. To apply directly via SQL:

   ```sql
   CREATE TABLE IF NOT EXISTS admins (
     user_id text PRIMARY KEY NOT NULL,
     email text,
     created_at timestamp with time zone DEFAULT now() NOT NULL
   );
   ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

   INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
   SELECT '63056d1cc40d6984ee2db76dd403feb6c57c0c68f3f8ef86625bedd7a4ed89ff', 1785793039987
   WHERE NOT EXISTS (
     SELECT 1 FROM drizzle.__drizzle_migrations
     WHERE hash = '63056d1cc40d6984ee2db76dd403feb6c57c0c68f3f8ef86625bedd7a4ed89ff'
   );
   ```

## Live infrastructure

- **Supabase** project `sumxigmxbtickbfkzrxf` (`eu-central-1`, Frankfurt), Postgres 17.
  - Applied: migrations `0000` (products), `0001` (products RLS). Launch product seeded.
  - Pending: migration `0002` (admins).
- Runtime `DATABASE_URL` / Fly secrets not set yet (deploy-time — BAG-21).

## How to continue in a new chat

1. Read this file and `README.md`, and skim `git log` on the branch.
2. If the Linear MCP connects, reconcile the "Pending" items above.
3. Next unblocked work: **BAG-13** (design system), then storefront/admin polish;
   **BAG-17/18** (shipping + Stripe checkout) once Stripe keys are available.
