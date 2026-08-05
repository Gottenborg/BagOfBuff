import { useState } from "react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { Badge, Button, Container, Heading, Text } from "@repo/ui";
import { SiteHeader } from "../components/site-header";
import { addToCart } from "../lib/cart";
import { formatPrice } from "../lib/format";
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
        <p className="mt-2 text-xl font-semibold">
          {formatPrice(product.priceCents, product.currency)}
          <span className="ml-2 text-sm font-normal text-muted">incl. VAT</span>
        </p>

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
      </Container>
    </>
  );
}
