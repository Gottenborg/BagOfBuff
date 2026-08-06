CREATE TABLE "subscription_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"name" text NOT NULL,
	"interval" text DEFAULT 'month' NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"stripe_product_id" text,
	"stripe_price_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_stripe_price_id_unique" UNIQUE("stripe_price_id")
);
--> statement-breakpoint
ALTER TABLE "subscription_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"stripe_customer_id" text,
	"plan_id" text,
	"product_id" text,
	"email" text,
	"status" text DEFAULT 'incomplete' NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"amount_cents" integer,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"ship_name" text,
	"ship_line1" text,
	"ship_line2" text,
	"ship_city" text,
	"ship_postal_code" text,
	"ship_country" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "origin" text DEFAULT 'one_time' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "subscription_id" text;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD CONSTRAINT "subscription_plans_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;