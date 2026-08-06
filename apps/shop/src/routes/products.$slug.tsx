import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { Badge, Button, Card, Container, Heading, Text } from "@repo/ui";
import { SiteHeader } from "../components/site-header";
import { addToCart } from "../lib/cart";
import { formatInterval, formatPrice } from "../lib/format";
import { api } from "../lib/api";

export const Route = createFileRoute("/products/$slug")({
  // SSR loader: fetch the product on the server so the page is crawlable and
  // the head tags below are populated for social/OG previews.
  loader: async ({ params }) => {
    const { data, error } = await api.GET("/products/{slug}", {
      params: { path: { slug: params.slug } },
    });
    if (error || !data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.name} — Bag of Buff` },
          { name: "description", content: loaderData.description ?? "" },
          { property: "og:title", content: loaderData.name },
          { property: "og:description", content: loaderData.description ?? "" },
          { property: "og:type", content: "product" },
        ]
      : [],
  }),
  component: ProductDetail,
});

function ProductDetail() {
  const product = Route.useLoaderData();
  const [added, setAdded] = useState(false);

  return (
    <>
      <SiteHeader />
      <Container as="main" size="md" className="py-12">
        <Heading level={1} size={2}>
          {product.name}
        </Heading>
        <PriceBlock product={product} />

        {product.description && (
          <Text className="mt-4 text-ink-700">{product.description}</Text>
        )}

        <div className="mt-4">
          {product.stock > 0 ? (
            <Badge variant="success">In stock: {product.stock}</Badge>
          ) : (
            <Badge variant="danger">Out of stock</Badge>
          )}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button
            size="lg"
            disabled={product.stock <= 0}
            onClick={() => {
              addToCart({
                slug: product.slug,
                name: product.name,
                priceCents: product.priceCents,
                currency: product.currency,
              });
              setAdded(true);
            }}
          >
            Add to cart
          </Button>
          {added && <span className="text-sm text-success">Added ✓</span>}
        </div>

        <SubscribeOptions productId={product.id} />
      </Container>
    </>
  );
}

/**
 * VAT-inclusive price with EU compliance: when a product is on sale
 * (`compareAtCents` above the current price) we show the reference price struck
 * through and, per the Omnibus directive, the lowest price of the prior 30 days.
 */
function PriceBlock({
  product,
}: {
  product: {
    priceCents: number;
    compareAtCents: number | null;
    lowestPriceCents30d: number | null;
    currency: string;
  };
}) {
  const onSale =
    product.compareAtCents !== null &&
    product.compareAtCents > product.priceCents;

  return (
    <div className="mt-2">
      <p className="text-xl font-semibold">
        <span className={onSale ? "text-danger" : undefined}>
          {formatPrice(product.priceCents, product.currency)}
        </span>
        {onSale && (
          <span className="ml-2 text-base font-normal text-muted line-through">
            {formatPrice(product.compareAtCents!, product.currency)}
          </span>
        )}
        <span className="ml-2 text-sm font-normal text-muted">incl. VAT</span>
      </p>
      {onSale && product.lowestPriceCents30d !== null && (
        <p className="mt-1 text-xs text-muted">
          Lowest price in the last 30 days:{" "}
          {formatPrice(product.lowestPriceCents30d, product.currency)}
        </p>
      )}
    </div>
  );
}

/**
 * Subscribe & save. Shown only when the product has active subscription plans.
 * Clicking a plan opens a Stripe subscription checkout.
 */
function SubscribeOptions({ productId }: { productId: string }) {
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);

  const { data: plans } = useQuery({
    queryKey: ["plans", productId],
    queryFn: async () => {
      const { data, error } = await api.GET("/subscription-plans", {
        params: { query: { productId } },
      });
      if (error) return [];
      return data;
    },
  });

  if (!plans || plans.length === 0) return null;

  async function subscribe(planId: string) {
    setPendingPlan(planId);
    const { data, error } = await api.POST("/checkout/subscription", {
      body: { planId },
    });
    if (error || !data) {
      setPendingPlan(null);
      return;
    }
    window.location.href = data.url;
  }

  return (
    <Card className="mt-10 p-5">
      <Heading level={2} size={4}>
        Subscribe &amp; save
      </Heading>
      <Text muted className="mt-1 text-sm">
        Never run out. Cancel anytime.
      </Text>
      <ul className="mt-4 space-y-2">
        {plans.map((plan) => (
          <li
            key={plan.id}
            className="flex items-center justify-between rounded-md border border-border p-3"
          >
            <span>
              <span className="font-medium">{plan.name}</span>
              <span className="ml-2 text-sm text-muted">
                {formatPrice(plan.priceCents, plan.currency)}{" "}
                {formatInterval(plan.interval, plan.intervalCount)}
              </span>
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={pendingPlan !== null}
              onClick={() => subscribe(plan.id)}
            >
              {pendingPlan === plan.id ? "Redirecting…" : "Subscribe"}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
