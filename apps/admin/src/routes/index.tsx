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
  Textarea,
} from "@repo/ui";
import { AdminShell } from "../components/admin-shell";
import { ProductImages } from "../components/product-images";
import { apiErrorMessage } from "../lib/errors";
import { formatPrice } from "../lib/format";
import { api } from "../lib/api";

export const Route = createFileRoute("/")({ component: AdminRoot });

type Product =
  paths["/products/"]["get"]["responses"][200]["content"]["application/json"][number];

/** Markets we price in. DKK is base — Bag of Buff is Danish. */
const CURRENCIES = ["DKK", "EUR"] as const;
type Currency = (typeof CURRENCIES)[number];
const SYMBOL: Record<Currency, string> = { DKK: "kr.", EUR: "€" };

/** The stored price for one currency, or undefined when not set for that market. */
function priceIn(product: Product, currency: Currency) {
  return product.prices.find((p) => p.currency === currency);
}

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
                  onRefresh={invalidate}
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
  onRefresh,
  onToggleActive,
  toggleDisabled,
}: {
  product: Product;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: () => void;
  /** Reload data without closing the editor (used after image changes). */
  onRefresh: () => void;
  onToggleActive: () => void;
  toggleDisabled: boolean;
}) {
  return (
    <>
      <tr className="border-b border-border/70 last:border-0 hover:bg-subtle/40">
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            {product.images[0] ? (
              <img
                src={product.images[0].url}
                alt={product.images[0].alt}
                className="h-9 w-9 shrink-0 rounded object-cover"
              />
            ) : (
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-dashed border-border text-[10px] text-muted"
                title="No image"
              >
                —
              </div>
            )}
            <div>
              <div className="font-medium text-foreground">{product.name}</div>
              <div className="text-xs text-muted">{product.slug}</div>
            </div>
          </div>
        </td>
        <td className="px-4 py-2.5 font-mono text-xs text-muted">
          {product.sku}
        </td>
        <td className="px-4 py-2.5 tabular-nums">
          {CURRENCIES.map((currency) => {
            const row = priceIn(product, currency);
            if (!row) {
              return (
                <div key={currency} className="text-xs text-danger">
                  {currency} — no price set
                </div>
              );
            }
            const rowPct = discountPercent(row.compareAtCents, row.priceCents);
            return (
              <div key={currency} className="whitespace-nowrap">
                {rowPct !== null && (
                  <span className="mr-1.5 text-muted line-through">
                    {formatPrice(row.compareAtCents!, currency)}
                  </span>
                )}
                <span
                  className={rowPct !== null ? "font-medium text-danger" : undefined}
                >
                  {formatPrice(row.priceCents, currency)}
                </span>
                {rowPct !== null && (
                  <Badge variant="danger" className="ml-2">
                    −{rowPct}%
                  </Badge>
                )}
              </div>
            );
          })}
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
              onRefresh={onRefresh}
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
  onRefresh,
}: {
  product: Product;
  onCancel: () => void;
  onSaved: () => void;
  onRefresh: () => void;
}) {
  const [name, setName] = useState(product.name);
  const [slug, setSlug] = useState(product.slug);
  const [sku, setSku] = useState(product.sku);
  const [description, setDescription] = useState(product.description ?? "");
  const [seoTitle, setSeoTitle] = useState(product.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(
    product.seoDescription ?? "",
  );
  const [stock, setStock] = useState(String(product.stock));

  // One editable price per market. Prices are set per market rather than
  // converted, so each currency carries its own price and promotion.
  const [prices, setPrices] = useState<
    Record<Currency, { price: string; compareAt: string; percent: string }>
  >(() =>
    Object.fromEntries(
      CURRENCIES.map((c) => {
        const row = priceIn(product, c);
        const pct = row
          ? discountPercent(row.compareAtCents, row.priceCents)
          : null;
        return [
          c,
          {
            price: row ? toEuros(row.priceCents) : "",
            compareAt: row ? toEuros(row.compareAtCents) : "",
            percent: pct === null ? "" : String(pct),
          },
        ];
      }),
    ) as Record<Currency, { price: string; compareAt: string; percent: string }>,
  );

  function update(currency: Currency, patch: Partial<(typeof prices)[Currency]>) {
    setPrices((prev) => ({ ...prev, [currency]: { ...prev[currency], ...patch } }));
  }

  /** Price and percent are two views of one discount — keep them in step. */
  function changePrice(currency: Currency, next: string) {
    const { compareAt } = prices[currency];
    const pct = discountPercent(
      compareAt.trim() ? toCents(compareAt) : null,
      toCents(next),
    );
    update(currency, { price: next, percent: pct === null ? "" : String(pct) });
  }

  function changeCompareAt(currency: Currency, next: string) {
    const { price } = prices[currency];
    const pct = discountPercent(
      next.trim() ? toCents(next) : null,
      toCents(price),
    );
    update(currency, { compareAt: next, percent: pct === null ? "" : String(pct) });
  }

  function changePercent(currency: Currency, next: string) {
    const pct = Number(next);
    if (!next.trim() || !Number.isFinite(pct) || pct < 0 || pct >= 100) {
      update(currency, { percent: next });
      return;
    }
    // With no reference price yet, "20% off" means off the current price, so
    // the current price becomes the reference.
    const { price, compareAt } = prices[currency];
    const base = compareAt.trim() ? toCents(compareAt) : toCents(price);
    update(currency, {
      percent: next,
      compareAt: toEuros(base),
      price: toEuros(Math.round(base * (1 - pct / 100))),
    });
  }

  const save = useMutation({
    mutationFn: async () => {
      const priceInputs = CURRENCIES.filter((c) => prices[c].price.trim()).map(
        (c) => ({
          currency: c,
          priceCents: toCents(prices[c].price),
          compareAtCents: prices[c].compareAt.trim()
            ? toCents(prices[c].compareAt)
            : null,
        }),
      );
      const { error, response } = await api.PATCH("/products/{id}", {
        params: { path: { id: product.id } },
        body: {
          name,
          slug,
          sku,
          description: description.trim() ? description : null,
          seoTitle: seoTitle.trim() ? seoTitle : null,
          seoDescription: seoDescription.trim() ? seoDescription : null,
          stock: Number(stock),
          prices: priceInputs,
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
      {/* items-start keeps every input on one baseline; fields carrying a hint
          would otherwise be pushed up by items-end. */}
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

      <p className="mt-4 text-xs font-semibold text-muted">
        Pricing per market — each is set deliberately, not converted
      </p>
      {CURRENCIES.map((currency) => (
        <div
          key={currency}
          className="mt-2 flex flex-wrap items-start gap-3 rounded-md border border-border bg-paper p-3"
        >
          <div className="w-12 pt-[1.375rem] text-[13px] font-semibold">
            {currency}
          </div>
          <Field
            label={`Price (${SYMBOL[currency]})`}
            htmlFor={`e-price-${currency}-${id}`}
            className="w-32"
          >
            <Input
              id={`e-price-${currency}-${id}`}
              type="number"
              step="0.01"
              min="0"
              value={prices[currency].price}
              onChange={(e) => changePrice(currency, e.target.value)}
            />
          </Field>
          <Field
            label="Compare at"
            htmlFor={`e-compare-${currency}-${id}`}
            className="w-32"
            hint="Blank = not on sale"
          >
            <Input
              id={`e-compare-${currency}-${id}`}
              type="number"
              step="0.01"
              min="0"
              value={prices[currency].compareAt}
              onChange={(e) => changeCompareAt(currency, e.target.value)}
            />
          </Field>
          <Field
            label="Discount %"
            htmlFor={`e-pct-${currency}-${id}`}
            className="w-28"
            hint="Sets the price"
          >
            <Input
              id={`e-pct-${currency}-${id}`}
              type="number"
              min="0"
              max="99"
              value={prices[currency].percent}
              onChange={(e) => changePercent(currency, e.target.value)}
            />
          </Field>
          {!prices[currency].price.trim() && (
            <p className="w-full text-xs text-danger">
              No price for this market — customers billed in {currency} fall back
              to the base price.
            </p>
          )}
        </div>
      ))}

      <Field
        label="Description"
        htmlFor={`e-desc-${id}`}
        className="mt-4 max-w-3xl"
        hint="Shown on the product page. Blank lines separate paragraphs."
      >
        <Textarea
          id={`e-desc-${id}`}
          rows={6}
          value={description}
          placeholder="What it is, what's in it, who it's for…"
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <p className="mt-4 text-xs font-semibold text-muted">
        Search &amp; social — leave blank to reuse the name and description
      </p>
      <div className="mt-2 max-w-3xl space-y-3">
        <Field
          label="SEO title"
          htmlFor={`e-seotitle-${id}`}
          hint={`${seoTitle.length}/60 — search engines typically truncate beyond this`}
        >
          <Input
            id={`e-seotitle-${id}`}
            value={seoTitle}
            placeholder={product.name}
            onChange={(e) => setSeoTitle(e.target.value)}
          />
        </Field>
        <Field
          label="SEO description"
          htmlFor={`e-seodesc-${id}`}
          hint={`${seoDescription.length}/160 — shown as the search result snippet`}
        >
          <Textarea
            id={`e-seodesc-${id}`}
            rows={2}
            value={seoDescription}
            placeholder={product.description ?? "A short, enticing summary"}
            onChange={(e) => setSeoDescription(e.target.value)}
          />
        </Field>
      </div>

      <div className="mt-5">
        <ProductImages
          productId={product.id}
          images={product.images}
          onChanged={onRefresh}
        />
      </div>

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
  const [stock, setStock] = useState("");
  const [prices, setPrices] = useState<Record<Currency, string>>({
    DKK: "",
    EUR: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      const priceInputs = CURRENCIES.filter((c) => prices[c].trim()).map((c) => ({
        currency: c,
        priceCents: toCents(prices[c]),
      }));
      const { error, response } = await api.POST("/products/", {
        body: {
          slug,
          sku,
          name,
          stock: stock ? Number(stock) : 0,
          prices: priceInputs,
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
      setStock("");
      setPrices({ DKK: "", EUR: "" });
      onCreated();
    },
  });

  // At least one market must be priced, and DKK is the base the rest falls
  // back to, so require it here rather than failing at the API.
  const canSubmit = prices.DKK.trim().length > 0;

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
          <Field label="Name" htmlFor="np-name" className="w-44">
            <Input
              id="np-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Slug" htmlFor="np-slug" className="w-36">
            <Input
              id="np-slug"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </Field>
          <Field label="SKU" htmlFor="np-sku" className="w-32">
            <Input
              id="np-sku"
              required
              value={sku}
              placeholder="BOB-300G"
              onChange={(e) => setSku(e.target.value)}
            />
          </Field>
          <Field label="Price (kr.)" htmlFor="np-dkk" className="w-28">
            <Input
              id="np-dkk"
              required
              type="number"
              step="0.01"
              min="0"
              value={prices.DKK}
              onChange={(e) =>
                setPrices((p) => ({ ...p, DKK: e.target.value }))
              }
            />
          </Field>
          <Field
            label="Price (€)"
            htmlFor="np-eur"
            className="w-28"
            hint="Optional now"
          >
            <Input
              id="np-eur"
              type="number"
              step="0.01"
              min="0"
              value={prices.EUR}
              onChange={(e) =>
                setPrices((p) => ({ ...p, EUR: e.target.value }))
              }
            />
          </Field>
          <Field label="Stock" htmlFor="np-stock" className="w-20">
            <Input
              id="np-stock"
              type="number"
              min="0"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          </Field>
          {/* Aligns with the inputs, which sit under their labels. */}
          <div className="pt-[1.375rem]">
            <Button type="submit" disabled={create.isPending || !canSubmit}>
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
