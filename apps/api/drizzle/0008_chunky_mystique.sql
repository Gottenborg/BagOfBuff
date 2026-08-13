-- Add the required SKU. Written in three steps rather than a bare
-- `ADD COLUMN ... NOT NULL`, which would fail against a table that already has
-- rows (there is no sensible default for an identifier).
ALTER TABLE "products" ADD COLUMN "sku" text;--> statement-breakpoint

-- Backfill existing products from their slug (bag-of-buff -> BAG-OF-BUFF).
-- Editable afterwards in the back office.
UPDATE "products" SET "sku" = upper("slug") WHERE "sku" IS NULL;--> statement-breakpoint

ALTER TABLE "products" ALTER COLUMN "sku" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_sku_unique" UNIQUE("sku");
