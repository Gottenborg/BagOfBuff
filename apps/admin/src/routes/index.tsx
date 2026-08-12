import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Field,
  Input,
  Loading,
  Text,
} from "@repo/ui";
import { AdminShell } from "../components/admin-shell";
import { apiErrorMessage } from "../lib/errors";
import { formatPrice } from "../lib/format";
import { api } from "../lib/api";

export const Route = createFileRoute("/")({ component: AdminRoot });

function AdminRoot() {
  return (
    <AdminShell subtitle="Manage the Bag of Buff catalogue.">
      <Dashboard />
    </AdminShell>
  );
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
    <>
      <NewProductForm
        onCreated={() =>
          queryClient.invalidateQueries({ queryKey: ["products", "all"] })
        }
      />

      {isLoading && <Loading className="mt-8" />}
      {isError && (
        <Text className="mt-8 text-danger">
          Could not load the catalogue. The API is unreachable or its database
          is down — check <code>/health</code> on the API for details.
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
    </>
  );
}

function NewProductForm({ onCreated }: { onCreated: () => void }) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error, response } = await api.POST("/products/", {
        body: {
          slug,
          name,
          priceCents: Math.round(Number(price) * 100),
          stock: stock ? Number(stock) : 0,
        },
      });
      if (error)
        throw new Error(
          apiErrorMessage(error, response, "Could not create product."),
        );
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
          <Field label="Name" htmlFor="np-name" className="w-48">
            <Input
              id="np-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Slug" htmlFor="np-slug" className="w-40">
            <Input
              id="np-slug"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </Field>
          <Field label="Price (€)" htmlFor="np-price" className="w-28">
            <Input
              id="np-price"
              required
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          <Field label="Stock" htmlFor="np-stock" className="w-24">
            <Input
              id="np-stock"
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
              {create.error.message}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
