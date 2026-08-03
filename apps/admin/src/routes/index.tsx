import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@repo/ui";
import { api } from "../lib/api";

export const Route = createFileRoute("/")({ component: Dashboard });

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function Dashboard() {
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
    <main className="mx-auto max-w-6xl p-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Back office</h1>
          <p className="mt-1 text-neutral-600">Manage the Bag of Buff catalogue.</p>
        </div>
        <Button>New product</Button>
      </header>

      {isLoading && <p className="text-neutral-500">Loading…</p>}
      {isError && (
        <p className="text-red-600">
          Could not reach the API. Is it running on port 3001?
        </p>
      )}

      {products && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Slug</th>
              <th className="py-2 font-medium">Price</th>
              <th className="py-2 font-medium">Stock</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-neutral-500">
                  No products yet.
                </td>
              </tr>
            )}
            {products.map((product) => (
              <tr key={product.id} className="border-b border-neutral-100">
                <td className="py-3 font-medium">{product.name}</td>
                <td className="py-3 text-neutral-600">{product.slug}</td>
                <td className="py-3">
                  {formatPrice(product.priceCents, product.currency)}
                </td>
                <td className="py-3">{product.stock}</td>
                <td className="py-3">
                  <span
                    className={
                      product.active
                        ? "text-green-700"
                        : "text-neutral-400"
                    }
                  >
                    {product.active ? "Active" : "Draft"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
