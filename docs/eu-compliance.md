# EU compliance

Operational notes for selling physical goods to EU consumers. The code enforces
the technical parts; this document covers the process/registration parts that
live outside the app.

## VAT

- **Display:** all storefront prices are VAT-inclusive (enforced in the UI).
- **Calculation:** VAT is computed **in-house** (`apps/api/src/lib/vat.ts`), not
  by Stripe Tax. Below the OSS threshold a Danish seller charges **Danish VAT
  (25%) on every EU sale** regardless of destination, so there is no rate table
  to maintain. Sales outside the EU are zero-rated (the buyer pays import VAT).
  The VAT recorded on an order is the portion *contained in* the gross total,
  derived from what Stripe actually charged, so net + VAT always reconciles.
- **The €10,000 threshold is the thing to watch.** Once cross-border B2C sales
  to other member states exceed €10,000 in a calendar year, every subsequent
  sale must carry the **destination country's** rate — liability starts at the
  transaction that crosses the line, not at the next year.
  - `GET /admin/tax/oss` reports the position; the back office shows a warning
    on the orders screen from **80%** of the threshold.
  - At that point either enable **Stripe Tax** (`automatic_tax: { enabled: true }`
    in `checkout.service` and `subscriptions.service` — the line items already
    carry the tax codes) or maintain a rate table. Stripe Tax is the cheaper
    option at that volume.
- **VAT OSS (One Stop Shop):**
  1. Register for the **Union OSS** scheme in the country of establishment
     (a single registration covers B2C sales of goods to consumers across the
     EU once the €10,000 pan-EU threshold is exceeded).
  2. Each quarter, pull VAT collected per member state — from the `orders`
     table while VAT is in-house, or Stripe Tax reporting once enabled.
  3. File the **quarterly OSS return** and pay via the national OSS portal.
  4. Keep OSS records for **10 years** (statutory retention).

## Consumer law

- **14-day right of withdrawal:** `/legal/returns` states the terms and includes
  the statutory **model withdrawal form**. Reimbursement within 14 days of being
  informed; consumer bears direct return cost.
- **Omnibus directive (prior-price transparency):** any promotional price must
  show the **lowest price of the prior 30 days**. Implemented via
  `product_price_history` (a row is appended on every price change) and surfaced
  as `lowestPriceCents30d` on the product API; the storefront shows it whenever
  `compareAtCents` marks a product as discounted.
- **Statutory guarantee of conformity:** referenced in the Terms.

## Privacy (GDPR) & data residency

All processors are EU-region:

| Concern            | Processor              | Region        |
| ------------------ | ---------------------- | ------------- |
| Database & auth    | Supabase               | Frankfurt, EU |
| Transactional email| Resend                 | EU            |
| Hosting            | (Fly.io — see BAG-21)  | EU region     |
| Payments           | Stripe                 | EU entity     |

- **Cookies/consent:** only strictly-necessary storage runs without consent
  (cart, checkout). Analytics are **cookieless (Plausible)** and additionally
  gated behind an explicit opt-in banner; declining removes no functionality.
- **Data-subject rights** (access, rectification, erasure, portability,
  objection) are described in `/legal/privacy`.
- Complete a **Record of Processing Activities (RoPA)** and sign **Data
  Processing Agreements** with Supabase, Resend, Stripe, and the host.

## Pre-launch checklist

- [ ] Fill in company legal entity, registration number, and contact address
      (footer + Terms).
- [ ] Complete Union OSS registration **before** cross-border sales reach
      €10,000 (the back office warns from 80%).
- [ ] Set `VITE_PLAUSIBLE_DOMAIN` (optional) once analytics is desired.
- [ ] Sign DPAs with all processors; complete the RoPA.
- [ ] Verify Resend sending domain and `ORDER_FROM_EMAIL`.
