import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Button } from "@repo/ui";
import { SiteHeader } from "../components/site-header";
import { addToCart } from "../lib/cart";
import { formatPrice } from "../lib/format";
import { api } from "../lib/api";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const {
    data: products,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await api.GET("/products/");
      if (error) throw new Error("Failed to load products");
      return data;
    },
  });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl p-8">
        <header className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight">Bag of Buff</h1>
          <p className="mt-2 text-neutral-600">The storefront starts here.</p>
        </header>

        {isLoading && <p className="text-neutral-500">Loading products…</p>}
        {isError && (
          <p className="text-red-600">
            Could not reach the API. Is it running on port 3001?
          </p>
        )}

        {products && products.length === 0 && (
          <p className="text-neutral-500">No products yet.</p>
        )}

        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products?.map((product) => (
            <li
              key={product.id}
              className="flex flex-col rounded-lg border border-neutral-200 p-5"
            >
              <Link
                to="/products/$slug"
                params={{ slug: product.slug }}
                className="text-lg font-semibold hover:underline"
              >
                {product.name}
              </Link>
              {product.description && (
                <p className="mt-1 flex-1 text-sm text-neutral-600">
                  {product.description}
                </p>
              )}
              <div className="mt-4 flex items-center justify-between">
                <span className="font-medium">
                  {formatPrice(product.priceCents, product.currency)}
                </span>
                <Button
                  size="sm"
                  onClick={() =>
                    addToCart({
                      slug: product.slug,
                      name: product.name,
                      priceCents: product.priceCents,
                      currency: product.currency,
                    })
                  }
                >
                  Add to cart
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
