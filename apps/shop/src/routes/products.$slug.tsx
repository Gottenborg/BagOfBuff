import { useState } from "react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { Button } from "@repo/ui";
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
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-3xl font-bold tracking-tight">{product.name}</h1>
        <p className="mt-2 text-xl font-medium">
          {formatPrice(product.priceCents, product.currency)}
          <span className="ml-2 text-sm font-normal text-neutral-500">
            incl. VAT
          </span>
        </p>

        {product.description && (
          <p className="mt-4 text-neutral-700">{product.description}</p>
        )}

        <p className="mt-4 text-sm text-neutral-500">
          {product.stock > 0 ? `In stock: ${product.stock}` : "Out of stock"}
        </p>

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
          {added && <span className="text-sm text-green-700">Added ✓</span>}
        </div>
      </main>
    </>
  );
}
