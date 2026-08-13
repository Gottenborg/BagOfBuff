CREATE TABLE "product_prices" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"currency" text NOT NULL,
	"price_cents" integer NOT NULL,
	"compare_at_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_prices_product_currency" UNIQUE("product_id","currency")
);
--> statement-breakpoint
ALTER TABLE "product_prices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Existing catalogue prices are euro: keep them as the EUR presentment price.
INSERT INTO "product_prices" ("id", "product_id", "currency", "price_cents", "compare_at_cents")
SELECT substr(md5(random()::text || "id"), 1, 21), "id", 'EUR', "price_cents", "compare_at_cents"
FROM "products"
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Seed DKK from the euro price at the ERM II central rate (7.46 DKK/EUR),
-- rounded to whole kroner. A price is a business decision per market, so this
-- is a reviewable starting point rather than a live conversion — the back
-- office flags derived prices for confirmation.
INSERT INTO "product_prices" ("id", "product_id", "currency", "price_cents", "compare_at_cents")
SELECT substr(md5(random()::text || "id" || 'dkk'), 1, 21), "id", 'DKK',
       (round("price_cents" * 7.46 / 100) * 100)::int,
       CASE WHEN "compare_at_cents" IS NULL THEN NULL
            ELSE (round("compare_at_cents" * 7.46 / 100) * 100)::int END
FROM "products"
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Bag of Buff is Danish, so DKK is the base currency. Keep products.* — which
-- other code still reads as "the" price — in step with the DKK row.
UPDATE "products" p
SET "currency" = 'DKK',
    "price_cents" = pp."price_cents",
    "compare_at_cents" = pp."compare_at_cents"
FROM "product_prices" pp
WHERE pp."product_id" = p."id" AND pp."currency" = 'DKK';--> statement-breakpoint

ALTER TABLE "products" ALTER COLUMN "currency" SET DEFAULT 'DKK';
--> statement-breakpoint

-- Shipping must be billed in the same currency as the goods, and rates are now
-- filtered by currency rather than converted. Any zone that serves only
-- Denmark therefore needs its rates in kroner, or Danish checkout would offer
-- no delivery at all. Convert at the same ERM II rate used for prices.
UPDATE "shipping_rates" r
SET "currency" = 'DKK',
    "price_cents" = (round(r."price_cents" * 7.46 / 100) * 100)::int,
    "free_above_cents" = CASE WHEN r."free_above_cents" IS NULL THEN NULL
                              ELSE (round(r."free_above_cents" * 7.46 / 100) * 100)::int END
FROM "shipping_zones" z
WHERE r."zone_id" = z."id"
  AND r."currency" = 'EUR'
  AND z."countries" = ARRAY['DK']::text[];
