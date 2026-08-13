import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Button, Card, Container, Heading, Loading, Text } from "@repo/ui";
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
      <Container as="main" size="lg" className="py-12">
        <header className="mb-10 max-w-2xl">
          <Heading level={1}>Strength, bagged.</Heading>
          <Text muted className="mt-3 text-lg">
            Supplements for people who actually keep showing up.
          </Text>
        </header>

        {isLoading && <Loading>Loading products…</Loading>}
        {isError && (
          <Text className="text-danger">
            We couldn't load the products right now. Please refresh, or try
            again in a moment.
          </Text>
        )}

        {products && products.length === 0 && (
          <Text muted>No products yet.</Text>
        )}

        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products?.map((product) => (
            <li key={product.id}>
              <Card className="flex h-full flex-col p-5">
                {product.images[0] && (
                  <Link to="/products/$slug" params={{ slug: product.slug }}>
                    <img
                      src={product.images[0].url}
                      alt={product.images[0].alt}
                      className="mb-3 aspect-square w-full rounded-md object-cover"
                      loading="lazy"
                    />
                  </Link>
                )}
                <Link
                  to="/products/$slug"
                  params={{ slug: product.slug }}
                  className="font-display text-lg font-bold tracking-tight hover:text-brand-strong"
                >
                  {product.name}
                </Link>
                {product.description && (
                  <p className="mt-1 flex-1 text-sm text-muted">
                    {product.description}
                  </p>
                )}
                <div className="mt-4 flex items-center justify-between">
                  <span className="font-semibold">
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
              </Card>
            </li>
          ))}
        </ul>
      </Container>
    </>
  );
}
