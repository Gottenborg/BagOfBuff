CREATE TABLE "product_price_history" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_price_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "compare_at_cents" integer;--> statement-breakpoint
ALTER TABLE "product_price_history" ADD CONSTRAINT "product_price_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;