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
  return Math.round(Number(euros.replace(",", ".")) * 100);
}

/** Percentage off, given a reference price and the current price. */
function discountPercent(
  compareAtCents: number | null,
  priceCents: number,
): number | null {
  if (compareAtCents === null || compareAtCents <= 0) return null;
  if (priceCents >= compareAtCents) return null;
  return Math.round(((compareAtCents - priceCents) / compareAtCents) * 100);
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
                <th className="px-4 py-2.5 font-semibold">SKU</th>
                <th className="px-4 py-2.5 font-semibold">Price</th>
                <th className="px-4 py-2.5 font-semibold">Stock</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
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
  const pct = discountPercent(product.compareAtCents, product.priceCents);

  return (
    <>
      <tr className="border-b border-border/70 last:border-0 hover:bg-subtle/40">
        <td className="px-4 py-2.5">
          <div className="font-medium text-foreground">{product.name}</div>
          <div className="text-xs text-muted">{product.slug}</div>
        </td>
        <td className="px-4 py-2.5 font-mono text-xs text-muted">
          {product.sku}
        </td>
        <td className="px-4 py-2.5 tabular-nums">
          {pct !== null && (
            <span className="mr-1.5 text-muted line-through">
              {formatPrice(product.compareAtCents!, product.currency)}
            </span>
          )}
          <span className={pct !== null ? "font-medium text-danger" : undefined}>
            {formatPrice(product.priceCents, product.currency)}
          </span>
          {pct !== null && (
            <Badge variant="danger" className="ml-2">
              −{pct}%
            </Badge>
          )}
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
          <td colSpan={6} className="px-4 py-4">
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
  const [sku, setSku] = useState(product.sku);
  const [description, setDescription] = useState(product.description ?? "");
  const [price, setPrice] = useState(toEuros(product.priceCents));
  const [compareAt, setCompareAt] = useState(toEuros(product.compareAtCents));
  const [stock, setStock] = useState(String(product.stock));
  const [percent, setPercent] = useState(() => {
    const p = discountPercent(product.compareAtCents, product.priceCents);
    return p === null ? "" : String(p);
  });

  /** Price and percent are two views of the same discount — keep them in sync. */
  function changePrice(next: string) {
    setPrice(next);
    const p = discountPercent(
      compareAt.trim() ? toCents(compareAt) : null,
      toCents(next),
    );
    setPercent(p === null ? "" : String(p));
  }

  function changeCompareAt(next: string) {
    setCompareAt(next);
    const p = discountPercent(
      next.trim() ? toCents(next) : null,
      toCents(price),
    );
    setPercent(p === null ? "" : String(p));
  }

  function changePercent(next: string) {
    setPercent(next);
    const pct = Number(next);
    if (!next.trim() || !Number.isFinite(pct) || pct < 0 || pct >= 100) return;
    // With no reference price yet, "20% off" means off the current price — so
    // the current price becomes the reference and the new price is derived.
    const base = compareAt.trim() ? toCents(compareAt) : toCents(price);
    if (!compareAt.trim()) setCompareAt(toEuros(base));
    setPrice(toEuros(Math.round(base * (1 - pct / 100))));
  }

  const save = useMutation({
    mutationFn: async () => {
      const { error, response } = await api.PATCH("/products/{id}", {
        params: { path: { id: product.id } },
        body: {
          name,
          slug,
          sku,
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

  const id = product.id;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {/* items-start keeps every input on the same baseline; fields carrying a
          hint would otherwise be pushed up by items-end. */}
      <div className="flex flex-wrap items-start gap-3">
        <Field label="Name" htmlFor={`e-name-${id}`} className="w-48">
          <Input
            id={`e-name-${id}`}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Slug" htmlFor={`e-slug-${id}`} className="w-40">
          <Input
            id={`e-slug-${id}`}
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </Field>
        <Field label="SKU" htmlFor={`e-sku-${id}`} className="w-36">
          <Input
            id={`e-sku-${id}`}
            required
            value={sku}
            onChange={(e) => setSku(e.target.value)}
          />
        </Field>
        <Field label="Price (€)" htmlFor={`e-price-${id}`} className="w-28">
          <Input
            id={`e-price-${id}`}
            required
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => changePrice(e.target.value)}
          />
        </Field>
        <Field
          label="Compare at (€)"
          htmlFor={`e-compare-${id}`}
          className="w-32"
          hint="Blank = not on sale"
        >
          <Input
            id={`e-compare-${id}`}
            type="number"
            step="0.01"
            min="0"
            value={compareAt}
            onChange={(e) => changeCompareAt(e.target.value)}
          />
        </Field>
        <Field
          label="Discount %"
          htmlFor={`e-pct-${id}`}
          className="w-28"
          hint="Sets the price"
        >
          <Input
            id={`e-pct-${id}`}
            type="number"
            min="0"
            max="99"
            value={percent}
            onChange={(e) => changePercent(e.target.value)}
          />
        </Field>
        <Field label="Stock" htmlFor={`e-stock-${id}`} className="w-24">
          <Input
            id={`e-stock-${id}`}
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
        htmlFor={`e-desc-${id}`}
        className="mt-3 max-w-2xl"
      >
        <Input
          id={`e-desc-${id}`}
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
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error, response } = await api.POST("/products/", {
        body: {
          slug,
          sku,
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
      setSku("");
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
          className="flex flex-wrap items-start gap-3"
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
          <Field label="SKU" htmlFor="np-sku" className="w-36">
            <Input
              id="np-sku"
              required
              value={sku}
              placeholder="BOB-300G"
              onChange={(e) => setSku(e.target.value)}
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
          {/* Aligns the button with the inputs, which sit under their labels. */}
          <div className="pt-[1.375rem]">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Adding…" : "Add product"}
            </Button>
          </div>
          {create.isError && (
            <p className="w-full text-sm text-danger">{create.error.message}</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
