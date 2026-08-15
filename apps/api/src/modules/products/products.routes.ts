import { and, eq, gte, inArray, min } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import {
  productImages,
  productPriceHistory,
  productPrices,
  products,
  type Product,
  type ProductImage,
  type ProductPrice,
} from "../../db/schema";
import {
  BASE_CURRENCY,
  CURRENCIES,
  toCurrency,
  type Currency,
} from "../../lib/currency";
import { authPlugin, isAdmin } from "../auth/auth.plugin";
import {
  MANUAL_STOCK_REASONS,
  listMovements,
  moveStock,
  reconcile,
} from "./stock.service";
import { hasPriceIn, pricesForProducts, resolvePrice } from "./prices";

/** Omnibus window: lowest price must reflect the prior 30 days. */
const OMNIBUS_WINDOW_DAYS = 30;

/**
 * Append a price-history point (for Omnibus lowest-price computation). History
 * is per currency: the 30-day low a Danish shopper must be shown is the low in
 * kroner, not a conversion of the euro low.
 */
async function recordPrice(
  productId: string,
  currency: string,
  priceCents: number,
) {
  await db
    .insert(productPriceHistory)
    .values({ productId, currency, priceCents });
}

/**
 * Lowest recorded price per product over the Omnibus window, in one currency.
 * Products with no history in the window are absent from the map.
 */
async function omnibusLowest(
  productIds: string[],
  currency: Currency,
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const since = new Date(Date.now() - OMNIBUS_WINDOW_DAYS * 24 * 3600 * 1000);
  const rows = await db
    .select({
      productId: productPriceHistory.productId,
      lowest: min(productPriceHistory.priceCents),
    })
    .from(productPriceHistory)
    .where(
      and(
        inArray(productPriceHistory.productId, productIds),
        gte(productPriceHistory.recordedAt, since),
        eq(productPriceHistory.currency, currency),
      ),
    )
    .groupBy(productPriceHistory.productId);
  return new Map(
    rows
      .filter((r) => r.lowest !== null)
      .map((r) => [r.productId, Number(r.lowest)]),
  );
}

/** Gallery images for a set of products, grouped by product id. */
async function imagesForProducts(
  productIds: string[],
): Promise<Map<string, ProductImage[]>> {
  if (productIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(productImages)
    .where(inArray(productImages.productId, productIds));
  const byProduct = new Map<string, ProductImage[]>();
  for (const row of rows) {
    const list = byProduct.get(row.productId) ?? [];
    list.push(row);
    byProduct.set(row.productId, list);
  }
  return byProduct;
}

const Unauthorized = t.Object({ message: t.String() });
const Forbidden = t.Object({ message: t.String() });
const NotFound = t.Object({ message: t.String() });

/**
 * Plain number schema for response bodies. `t.Integer()` emits a coercible
 * string-or-integer union in OpenAPI (leaking into the client as
 * `string | number`), and `t.Unsafe({type:"integer"})` is not compilable by
 * Elysia's response validator. `t.Number()` compiles cleanly and generates a
 * plain `number` in the typed client — the JSON wire type is the same.
 */
const Int = t.Number();

const CurrencyLiteral = t.Union(CURRENCIES.map((c) => t.Literal(c)));

const PriceModel = t.Object({
  currency: t.String(),
  priceCents: Int,
  compareAtCents: t.Nullable(Int),
});

/**
 * OpenAPI response model. `priceCents`/`compareAtCents`/`currency` are the
 * amounts for the *requested* currency, so storefront code reads one price and
 * needs no currency logic; `prices` carries every stored currency for the back
 * office, and `missingCurrencies` flags markets with no deliberate price yet.
 */
const ImageModel = t.Object({
  id: t.String(),
  url: t.String(),
  alt: t.String(),
  position: Int,
});

const ProductModel = t.Object({
  id: t.String(),
  slug: t.String(),
  sku: t.String(),
  name: t.String(),
  description: t.Nullable(t.String()),
  seoTitle: t.Nullable(t.String()),
  seoDescription: t.Nullable(t.String()),
  /** Ordered gallery; the first is the primary/social image. */
  images: t.Array(ImageModel),
  priceCents: Int,
  compareAtCents: t.Nullable(Int),
  /** EU Omnibus: lowest price in the prior 30 days, in the same currency. */
  lowestPriceCents30d: t.Nullable(Int),
  currency: t.String(),
  prices: t.Array(PriceModel),
  missingCurrencies: t.Array(t.String()),
  stock: Int,
  active: t.Boolean(),
  createdAt: t.String({ format: "date-time" }),
  updatedAt: t.String({ format: "date-time" }),
});

const PriceInput = t.Object({
  currency: CurrencyLiteral,
  priceCents: t.Integer({ minimum: 0 }),
  compareAtCents: t.Optional(t.Nullable(t.Integer({ minimum: 0 }))),
});

/** Fields accepted when creating a product. */
const CreateProductBody = t.Object({
  slug: t.String({ minLength: 1 }),
  sku: t.String({ minLength: 1 }),
  name: t.String({ minLength: 1 }),
  description: t.Optional(t.Nullable(t.String())),
  seoTitle: t.Optional(t.Nullable(t.String())),
  seoDescription: t.Optional(t.Nullable(t.String())),
  /** At least one currency; others can be added later. */
  prices: t.Array(PriceInput, { minItems: 1 }),
  stock: t.Optional(t.Integer({ minimum: 0 })),
  active: t.Optional(t.Boolean()),
});

/** Fields accepted when updating a product — all optional. */
const UpdateProductBody = t.Partial(
  t.Object({
    slug: t.String({ minLength: 1 }),
    sku: t.String({ minLength: 1 }),
    name: t.String({ minLength: 1 }),
    description: t.Nullable(t.String()),
    seoTitle: t.Nullable(t.String()),
    seoDescription: t.Nullable(t.String()),
    /** Currencies present here are replaced; others are left untouched. */
    prices: t.Array(PriceInput),
    stock: t.Integer({ minimum: 0 }),
    active: t.Boolean(),
  }),
);

function serialize(
  product: Product,
  prices: ProductPrice[] | undefined,
  currency: Currency,
  lowestPriceCents30d: number | null,
  images: ProductImage[] = [],
) {
  const resolved = resolvePrice(product, prices, currency);
  return {
    id: product.id,
    slug: product.slug,
    sku: product.sku,
    name: product.name,
    description: product.description,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    images: images
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ id: i.id, url: i.url, alt: i.alt, position: i.position })),
    priceCents: resolved.priceCents,
    compareAtCents: resolved.compareAtCents,
    lowestPriceCents30d,
    currency: resolved.currency,
    prices: (prices ?? []).map((p) => ({
      currency: p.currency,
      priceCents: p.priceCents,
      compareAtCents: p.compareAtCents,
    })),
    missingCurrencies: CURRENCIES.filter((c) => !hasPriceIn(prices, c)),
    stock: product.stock,
    active: product.active,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

/**
 * Upserts the given per-currency prices and records an Omnibus history point
 * for each currency whose price actually changed. Returns the base-currency
 * amounts so `products.*` can be kept in step.
 */
async function writePrices(
  productId: string,
  inputs: { currency: Currency; priceCents: number; compareAtCents?: number | null }[],
): Promise<{ priceCents: number; compareAtCents: number | null; currency: Currency } | null> {
  const existing = await db
    .select()
    .from(productPrices)
    .where(eq(productPrices.productId, productId));

  for (const input of inputs) {
    const prior = existing.find((e) => e.currency === input.currency);
    await db
      .insert(productPrices)
      .values({
        productId,
        currency: input.currency,
        priceCents: input.priceCents,
        compareAtCents: input.compareAtCents ?? null,
      })
      .onConflictDoUpdate({
        target: [productPrices.productId, productPrices.currency],
        set: {
          priceCents: input.priceCents,
          compareAtCents: input.compareAtCents ?? null,
          updatedAt: new Date(),
        },
      });

    if (!prior || prior.priceCents !== input.priceCents) {
      await recordPrice(productId, input.currency, input.priceCents);
    }
  }

  // Keep the denormalised base price on `products` in step, preferring the
  // base currency and otherwise the first price given.
  const base =
    inputs.find((i) => i.currency === BASE_CURRENCY) ??
    existing.find((e) => e.currency === BASE_CURRENCY) ??
    inputs[0];
  if (!base) return null;
  return {
    currency: base.currency as Currency,
    priceCents: base.priceCents,
    compareAtCents: base.compareAtCents ?? null,
  };
}

/** Postgres unique-violation error code. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}

/**
 * Which field collided. Products are unique on both slug and SKU, so a generic
 * "already exists" leaves the operator guessing which one to change.
 */
function conflictMessage(err: unknown): string {
  const constraint =
    typeof err === "object" && err !== null && "constraint_name" in err
      ? String((err as { constraint_name?: unknown }).constraint_name ?? "")
      : "";
  if (constraint.includes("sku"))
    return "That SKU is already used by another product";
  if (constraint.includes("slug"))
    return "That slug is already used by another product";
  return "A product with those details already exists";
}

const CurrencyQuery = t.Optional(t.String({ minLength: 3, maxLength: 3 }));

export const productsRoutes = new Elysia({
  prefix: "/products",
  tags: ["Products"],
})
  .use(authPlugin)
  // --- Public reads -------------------------------------------------------
  .get(
    "/",
    async ({ query, user }) => {
      const currency = toCurrency(query.currency);
      // `includeInactive` (drafts) is honoured only for admins; anonymous or
      // non-admin callers always get active products.
      const showAll =
        query.includeInactive === true &&
        user !== null &&
        (await isAdmin(user.id));
      const rows = showAll
        ? await db.select().from(products)
        : await db.select().from(products).where(eq(products.active, true));

      const ids = rows.map((p) => p.id);
      const [priceMap, lowest, imageMap] = await Promise.all([
        pricesForProducts(ids),
        omnibusLowest(ids, currency),
        imagesForProducts(ids),
      ]);
      return rows.map((p) =>
        serialize(
          p,
          priceMap.get(p.id),
          currency,
          lowest.get(p.id) ?? null,
          imageMap.get(p.id) ?? [],
        ),
      );
    },
    {
      query: t.Object({
        includeInactive: t.Optional(t.Boolean()),
        currency: CurrencyQuery,
      }),
      response: { 200: t.Array(ProductModel) },
      detail: {
        summary: "List products (active only; drafts included for admins)",
        description:
          "Prices are returned in `currency` (default DKK, the base currency).",
      },
    },
  )
  .get(
    "/:slug",
    async ({ params, query, status }) => {
      const currency = toCurrency(query.currency);
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.slug, params.slug))
        .limit(1);
      if (!product) return status(404, { message: "Product not found" });
      const [priceMap, lowest, imageMap] = await Promise.all([
        pricesForProducts([product.id]),
        omnibusLowest([product.id], currency),
        imagesForProducts([product.id]),
      ]);
      return serialize(
        product,
        priceMap.get(product.id),
        currency,
        lowest.get(product.id) ?? null,
        imageMap.get(product.id) ?? [],
      );
    },
    {
      params: t.Object({ slug: t.String() }),
      query: t.Object({ currency: CurrencyQuery }),
      response: { 200: ProductModel, 404: NotFound },
      detail: { summary: "Get a product by slug" },
    },
  )
  // --- Admin writes -------------------------------------------------------
  .post(
    "/",
    async ({ body, status }) => {
      try {
        const base =
          body.prices.find((p) => p.currency === BASE_CURRENCY) ??
          body.prices[0]!;
        const [created] = await db
          .insert(products)
          .values({
            slug: body.slug,
            sku: body.sku,
            name: body.name,
            description: body.description ?? null,
            seoTitle: body.seoTitle ?? null,
            seoDescription: body.seoDescription ?? null,
            stock: body.stock ?? 0,
            active: body.active ?? true,
            currency: base.currency,
            priceCents: base.priceCents,
            compareAtCents: base.compareAtCents ?? null,
          })
          .returning();

        await writePrices(created!.id, body.prices);
        const priceMap = await pricesForProducts([created!.id]);
        return status(
          201,
          serialize(created!, priceMap.get(created!.id), base.currency, null),
        );
      } catch (err) {
        if (isUniqueViolation(err)) {
          return status(409, { message: conflictMessage(err) });
        }
        throw err;
      }
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      body: CreateProductBody,
      response: {
        201: ProductModel,
        401: Unauthorized,
        403: Forbidden,
        409: t.Object({ message: t.String() }),
      },
      detail: { summary: "Create a product (admin)" },
    },
  )
  .patch(
    "/:id",
    async ({ params, body, user, status }) => {
      try {
        const { prices, stock: requestedStock, ...fields } = body;

        // A stock number typed into the product form is a correction, and has
        // to be recorded as one — otherwise the ledger stops explaining the
        // balance the moment anyone edits it here.
        if (requestedStock !== undefined) {
          const [before] = await db
            .select({ stock: products.stock })
            .from(products)
            .where(eq(products.id, params.id))
            .limit(1);
          if (before && before.stock !== requestedStock) {
            await moveStock({
              productId: params.id,
              delta: requestedStock - before.stock,
              reason: "count",
              note: "Set directly on the product form",
              actor: user?.id ?? null,
            });
          }
        }

        const base = prices?.length
          ? await writePrices(params.id, prices)
          : null;

        const [updated] = await db
          .update(products)
          .set({
            ...fields,
            ...(base
              ? {
                  currency: base.currency,
                  priceCents: base.priceCents,
                  compareAtCents: base.compareAtCents,
                }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(products.id, params.id))
          .returning();
        if (!updated) return status(404, { message: "Product not found" });

        const [priceMap, imageMap] = await Promise.all([
          pricesForProducts([updated.id]),
          imagesForProducts([updated.id]),
        ]);
        return serialize(
          updated,
          priceMap.get(updated.id),
          BASE_CURRENCY,
          null,
          imageMap.get(updated.id) ?? [],
        );
      } catch (err) {
        if (isUniqueViolation(err)) {
          return status(409, { message: conflictMessage(err) });
        }
        throw err;
      }
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      params: t.Object({ id: t.String() }),
      body: UpdateProductBody,
      response: {
        200: ProductModel,
        401: Unauthorized,
        403: Forbidden,
        404: NotFound,
        409: t.Object({ message: t.String() }),
      },
      detail: { summary: "Update a product (admin)" },
    },
  )
  // --- Admin: gallery ------------------------------------------------------
  // Files are uploaded straight from the back office to Supabase Storage (the
  // browser holds the session, and large uploads shouldn't be proxied through
  // the API); this records the resulting public URL and its ordering.
  .post(
    "/:id/images",
    async ({ params, body, status }) => {
      const [product] = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, params.id))
        .limit(1);
      if (!product) return status(404, { message: "Product not found" });

      // Append to the end of the gallery unless a position is given.
      const existing = await db
        .select({ position: productImages.position })
        .from(productImages)
        .where(eq(productImages.productId, params.id));
      const nextPosition =
        body.position ??
        existing.reduce((max, r) => Math.max(max, r.position + 1), 0);

      const [created] = await db
        .insert(productImages)
        .values({
          productId: params.id,
          url: body.url,
          alt: body.alt ?? "",
          position: nextPosition,
        })
        .returning();
      return status(201, {
        id: created!.id,
        url: created!.url,
        alt: created!.alt,
        position: created!.position,
      });
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      params: t.Object({ id: t.String() }),
      body: t.Object({
        url: t.String({ minLength: 1 }),
        alt: t.Optional(t.String()),
        position: t.Optional(t.Integer({ minimum: 0 })),
      }),
      response: {
        201: ImageModel,
        401: Unauthorized,
        403: Forbidden,
        404: NotFound,
      },
      detail: { summary: "Attach an uploaded image to a product (admin)" },
    },
  )
  .patch(
    "/images/:imageId",
    async ({ params, body, status }) => {
      const [updated] = await db
        .update(productImages)
        .set(body)
        .where(eq(productImages.id, params.imageId))
        .returning();
      if (!updated) return status(404, { message: "Image not found" });
      return {
        id: updated.id,
        url: updated.url,
        alt: updated.alt,
        position: updated.position,
      };
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      params: t.Object({ imageId: t.String() }),
      body: t.Partial(
        t.Object({
          alt: t.String(),
          /** Lower sorts first; the lowest is the primary/social image. */
          position: t.Integer({ minimum: 0 }),
        }),
      ),
      response: {
        200: ImageModel,
        401: Unauthorized,
        403: Forbidden,
        404: NotFound,
      },
      detail: { summary: "Update an image's alt text or order (admin)" },
    },
  )
  .delete(
    "/images/:imageId",
    async ({ params, status }) => {
      const [removed] = await db
        .delete(productImages)
        .where(eq(productImages.id, params.imageId))
        .returning();
      if (!removed) return status(404, { message: "Image not found" });
      return { id: removed.id };
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      params: t.Object({ imageId: t.String() }),
      response: {
        200: t.Object({ id: t.String() }),
        401: Unauthorized,
        403: Forbidden,
        404: NotFound,
      },
      detail: {
        summary: "Remove an image from a product (admin)",
        description:
          "Removes the gallery entry. The file itself is deleted from storage by the back office.",
      },
    },
  )
  .delete(
    "/:id",
    async ({ params, status }) => {
      // Soft delete: archive rather than hard-delete so orders keep their
      // product reference.
      const [archived] = await db
        .update(products)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(products.id, params.id))
        .returning();
      if (!archived) return status(404, { message: "Product not found" });
      const [priceMap, imageMap] = await Promise.all([
        pricesForProducts([archived.id]),
        imagesForProducts([archived.id]),
      ]);
      return serialize(
        archived,
        priceMap.get(archived.id),
        BASE_CURRENCY,
        null,
        imageMap.get(archived.id) ?? [],
      );
    },
    {
      beforeHandle: async ({ user, status }) => {
        if (!user) return status(401, { message: "Unauthorized" });
        if (!(await isAdmin(user.id)))
          return status(403, { message: "Forbidden" });
      },
      params: t.Object({ id: t.String() }),
      response: {
        200: ProductModel,
        401: Unauthorized,
        403: Forbidden,
        404: NotFound,
      },
      detail: { summary: "Archive a product (admin)" },
    },
  );
