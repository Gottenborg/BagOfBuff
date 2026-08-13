import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { paths } from "@repo/api-client";
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

type Product =
  paths["/products/"]["get"]["responses"][200]["content"]["application/json"][number];

/** Minor units <-> a euro string for form inputs. */
function toEuros(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}
function toCents(euros: string): number {
  return Math.round(Number(euros) * 100);
}

function AdminRoot() {
  return (
    <AdminShell subtitle="Manage the Bag of Buff catalogue.">
      <Catalogue />
    </AdminShell>
  );
}

function Catalogue() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["products", "all"] });

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

  // Archiving and restoring are both a PATCH of `active`; DELETE is the
  // archive shortcut the API already exposes.
  const setActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error, response } = await api.PATCH("/products/{id}", {
        params: { path: { id } },
        body: { active },
      });
      if (error)
        throw new Error(
          apiErrorMessage(error, response, "Could not update the product."),
        );
    },
    onSuccess: invalidate,
  });

  return (
    <>
      <NewProductForm onCreated={invalidate} />

      {isLoading && <Loading className="mt-6" />}
      {isError && (
        <Text className="mt-6 text-danger">
          Could not load the catalogue. The API is unreachable or its database
          is down — check <code>/health</code> on the API for details.
        </Text>
      )}

      {setActive.isError && (
        <Text className="mt-6 text-danger">{setActive.error.message}</Text>
      )}

      {products && (
        <Card className="mt-6 overflow-hidden">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border bg-subtle/60 text-left text-muted">
                <th className="px-4 py-2.5 font-semibold">Product</th>
                <th className="px-4 py-2.5 font-semibold">Price</th>
                <th className="px-4 py-2.5 font-semibold">Stock</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    No products yet — add your first one above.
                  </td>
                </tr>
              )}
              {products.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  isEditing={editingId === product.id}
                  onEdit={() => setEditingId(product.id)}
                  onCancel={() => setEditingId(null)}
                  onSaved={() => {
                    setEditingId(null);
                    invalidate();
                  }}
                  onToggleActive={() =>
                    setActive.mutate({
                      id: product.id,
                      active: !product.active,
                    })
                  }
                  toggleDisabled={setActive.isPending}
                />
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

function ProductRow({
  product,
  isEditing,
  onEdit,
  onCancel,
  onSaved,
  onToggleActive,
  toggleDisabled,
}: {
  product: Product;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: () => void;
  onToggleActive: () => void;
  toggleDisabled: boolean;
}) {
  const onSale =
    product.compareAtCents !== null &&
    product.compareAtCents > product.priceCents;

  return (
    <>
      <tr className="border-b border-border/70 last:border-0 hover:bg-subtle/40">
        <td className="px-4 py-2.5">
          <div className="font-medium text-foreground">{product.name}</div>
          <div className="text-xs text-muted">{product.slug}</div>
        </td>
        <td className="px-4 py-2.5 tabular-nums">
          {onSale && (
            <span className="mr-1.5 text-muted line-through">
              {formatPrice(product.compareAtCents!, product.currency)}
            </span>
          )}
          <span className={onSale ? "font-medium text-danger" : undefined}>
            {formatPrice(product.priceCents, product.currency)}
          </span>
        </td>
        <td className="px-4 py-2.5 tabular-nums">
          <span className={product.stock === 0 ? "text-danger" : undefined}>
            {product.stock}
          </span>
        </td>
        <td className="px-4 py-2.5">
          {product.active ? (
            <Badge variant="success">Active</Badge>
          ) : (
            <Badge variant="neutral">Archived</Badge>
          )}
        </td>
        <td className="px-4 py-2.5 text-right whitespace-nowrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={isEditing ? onCancel : onEdit}
          >
            {isEditing ? "Close" : "Edit"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={toggleDisabled}
            onClick={onToggleActive}
          >
            {product.active ? "Archive" : "Restore"}
          </Button>
        </td>
      </tr>
      {isEditing && (
        <tr className="border-b border-border bg-subtle/40">
          <td colSpan={5} className="px-4 py-4">
            <EditProductForm
              product={product}
              onCancel={onCancel}
              onSaved={onSaved}
            />
          </td>
        </tr>
      )}
    </>
  );
}

/** Inline editor for an existing product. */
function EditProductForm({
  product,
  onCancel,
  onSaved,
}: {
  product: Product;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(product.name);
  const [slug, setSlug] = useState(product.slug);
  const [description, setDescription] = useState(product.description ?? "");
  const [price, setPrice] = useState(toEuros(product.priceCents));
  const [compareAt, setCompareAt] = useState(toEuros(product.compareAtCents));
  const [stock, setStock] = useState(String(product.stock));

  const save = useMutation({
    mutationFn: async () => {
      const { error, response } = await api.PATCH("/products/{id}", {
        params: { path: { id: product.id } },
        body: {
          name,
          slug,
          description: description.trim() ? description : null,
          priceCents: toCents(price),
          // Empty clears the discount; the storefront only shows a sale when
          // compare-at is above the current price.
          compareAtCents: compareAt.trim() ? toCents(compareAt) : null,
          stock: Number(stock),
        },
      });
      if (error)
        throw new Error(
          apiErrorMessage(error, response, "Could not save the product."),
        );
    },
    onSuccess: onSaved,
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Name" htmlFor={`e-name-${product.id}`} className="w-48">
          <Input
            id={`e-name-${product.id}`}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Slug" htmlFor={`e-slug-${product.id}`} className="w-40">
          <Input
            id={`e-slug-${product.id}`}
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </Field>
        <Field
          label="Price (€)"
          htmlFor={`e-price-${product.id}`}
          className="w-28"
        >
          <Input
            id={`e-price-${product.id}`}
            required
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </Field>
        <Field
          label="Compare at (€)"
          htmlFor={`e-compare-${product.id}`}
          className="w-32"
          hint="Blank = not on sale"
        >
          <Input
            id={`e-compare-${product.id}`}
            type="number"
            step="0.01"
            min="0"
            value={compareAt}
            onChange={(e) => setCompareAt(e.target.value)}
          />
        </Field>
        <Field label="Stock" htmlFor={`e-stock-${product.id}`} className="w-24">
          <Input
            id={`e-stock-${product.id}`}
            required
            type="number"
            min="0"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
          />
        </Field>
      </div>

      <Field
        label="Description"
        htmlFor={`e-desc-${product.id}`}
        className="mt-3 max-w-2xl"
      >
        <Input
          id={`e-desc-${product.id}`}
          value={description}
          placeholder="Shown on the product page"
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <div className="mt-4 flex items-center gap-2">
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        {save.isError && (
          <span className="text-sm text-danger">{save.error.message}</span>
        )}
      </div>
    </form>
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
          priceCents: toCents(price),
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
          className="flex flex-wrap items-end gap-3"
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
            <p className="w-full text-sm text-danger">{create.error.message}</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
