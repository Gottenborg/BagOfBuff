import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@repo/ui";
import { LoginForm } from "../components/login-form";
import { useSession, signOut } from "../lib/auth";
import { api } from "../lib/api";

export const Route = createFileRoute("/")({ component: AdminRoot });

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/** Auth gate: show the login form until there's a session. */
function AdminRoot() {
  const { session, loading } = useSession();
  if (loading) return <p className="p-8 text-neutral-500">Loading…</p>;
  if (!session) return <LoginForm />;
  return <Dashboard />;
}

function Dashboard() {
  const queryClient = useQueryClient();
  const {
    data: products,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["products", "all"],
    queryFn: async () => {
      const { data, error } = await api.GET("/products/", {
        params: { query: { includeInactive: true } },
      });
      if (error) throw new Error("Failed to load products");
      return data;
    },
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE("/products/{id}", {
        params: { path: { id } },
      });
      if (error) throw new Error("Failed to archive");
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["products", "all"] }),
  });

  return (
    <main className="mx-auto max-w-6xl p-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Back office</h1>
          <p className="mt-1 text-neutral-600">Manage the Bag of Buff catalogue.</p>
        </div>
        <Button variant="ghost" onClick={() => signOut()}>
          Sign out
        </Button>
      </header>

      <NewProductForm
        onCreated={() =>
          queryClient.invalidateQueries({ queryKey: ["products", "all"] })
        }
      />

      {isLoading && <p className="text-neutral-500">Loading…</p>}
      {isError && (
        <p className="text-red-600">
          Could not reach the API. Is it running on port 3001?
        </p>
      )}

      {products && (
        <table className="mt-8 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Slug</th>
              <th className="py-2 font-medium">Price</th>
              <th className="py-2 font-medium">Stock</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-neutral-500">
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
                      product.active ? "text-green-700" : "text-neutral-400"
                    }
                  >
                    {product.active ? "Active" : "Archived"}
                  </span>
                </td>
                <td className="py-3 text-right">
                  {product.active && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={archive.isPending}
                      onClick={() => archive.mutate(product.id)}
                    >
                      Archive
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

function NewProductForm({ onCreated }: { onCreated: () => void }) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST("/products/", {
        body: {
          slug,
          name,
          priceCents: Math.round(Number(price) * 100),
          stock: stock ? Number(stock) : 0,
        },
      });
      if (error) throw new Error("Failed to create product");
    },
    onSuccess: () => {
      setSlug("");
      setName("");
      setPrice("");
      setStock("");
      onCreated();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 p-4"
    >
      <Field label="Name">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-9 w-48 rounded-md border border-neutral-300 px-2 text-sm"
        />
      </Field>
      <Field label="Slug">
        <input
          required
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="h-9 w-40 rounded-md border border-neutral-300 px-2 text-sm"
        />
      </Field>
      <Field label="Price (€)">
        <input
          required
          type="number"
          step="0.01"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="h-9 w-28 rounded-md border border-neutral-300 px-2 text-sm"
        />
      </Field>
      <Field label="Stock">
        <input
          type="number"
          min="0"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          className="h-9 w-24 rounded-md border border-neutral-300 px-2 text-sm"
        />
      </Field>
      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? "Adding…" : "Add product"}
      </Button>
      {create.isError && (
        <p className="w-full text-sm text-red-600">
          Could not create product (are you signed in as an admin?).
        </p>
      )}
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-neutral-500">
      {label}
      {children}
    </label>
  );
}
