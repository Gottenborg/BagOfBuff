import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Container,
  Field,
  Heading,
  Input,
  Logo,
  Spinner,
  Text,
} from "@repo/ui";
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
  if (loading)
    return (
      <p className="flex items-center gap-2 p-8 text-muted">
        <Spinner /> Loading…
      </p>
    );
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
    <Container size="xl" className="py-10">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo markOnly />
          <div>
            <Heading level={3}>Back office</Heading>
            <Text muted className="text-sm">
              Manage the Bag of Buff catalogue.
            </Text>
          </div>
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

      {isLoading && (
        <p className="mt-8 flex items-center gap-2 text-muted">
          <Spinner /> Loading…
        </p>
      )}
      {isError && (
        <Text className="mt-8 text-danger">
          Could not reach the API. Is it running on port 3001?
        </Text>
      )}

      {products && (
        <Card className="mt-8 overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">Slug</th>
                <th className="px-5 py-3 font-semibold">Price</th>
                <th className="px-5 py-3 font-semibold">Stock</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-muted">
                    No products yet.
                  </td>
                </tr>
              )}
              {products.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-subtle last:border-0"
                >
                  <td className="px-5 py-3 font-semibold">{product.name}</td>
                  <td className="px-5 py-3 text-muted">{product.slug}</td>
                  <td className="px-5 py-3">
                    {formatPrice(product.priceCents, product.currency)}
                  </td>
                  <td className="px-5 py-3">{product.stock}</td>
                  <td className="px-5 py-3">
                    {product.active ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="neutral">Archived</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
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
        </Card>
      )}
    </Container>
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
    <Card>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="flex flex-wrap items-end gap-4"
        >
          <Field label="Name" className="w-48">
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Slug" className="w-40">
            <Input
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </Field>
          <Field label="Price (€)" className="w-28">
            <Input
              required
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          <Field label="Stock" className="w-24">
            <Input
              type="number"
              min="0"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Adding…" : "Add product"}
          </Button>
          {create.isError && (
            <p className="w-full text-sm text-danger">
              Could not create product (are you signed in as an admin?).
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
