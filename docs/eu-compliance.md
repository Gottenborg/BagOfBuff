# EU compliance

Operational notes for selling physical goods to EU consumers. The code enforces
the technical parts; this document covers the process/registration parts that
live outside the app.

## VAT

- **Display:** all storefront prices are VAT-inclusive (enforced in the UI).
- **Calculation:** VAT is computed at checkout by **Stripe Tax**, based on the
  ship-to country, for both one-time orders and subscriptions.
- **VAT OSS (One Stop Shop):**
  1. Register for the **Union OSS** scheme in the country of establishment
     (a single registration covers B2C sales of goods to consumers across the
     EU once the €10,000 pan-EU threshold is exceeded).
  2. Each quarter, use **Stripe Tax → Registrations/Reporting** to pull the
     VAT collected per member state.
  3. File the **quarterly OSS return** and pay via the national OSS portal.
  4. Keep OSS records for **10 years** (statutory retention).
- Enter each member-state VAT registration/threshold status in Stripe Tax so
  it charges the correct rate.

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
| Payments & VAT     | Stripe / Stripe Tax    | EU entity     |

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
- [ ] Complete Union OSS registration; enter registrations into Stripe Tax.
- [ ] Enable Stripe Tax with an origin address and confirm tax behaviour is
      "inclusive".
- [ ] Set `VITE_PLAUSIBLE_DOMAIN` (optional) once analytics is desired.
- [ ] Sign DPAs with all processors; complete the RoPA.
- [ ] Verify Resend sending domain and `ORDER_FROM_EMAIL`.
