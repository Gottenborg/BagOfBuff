import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../../db";
import { products, type Product } from "../../db/schema";

/**
 * A plain integer schema. Elysia's `t.Integer()` emits a coercible
 * string-or-integer union in OpenAPI (meant for inputs), which leaks into the
 * generated client as `string | number`; for response bodies we want a clean
 * `number`, so we declare the JSON Schema directly.
 */
const Int = t.Unsafe<number>({ type: "integer" });

/**
 * OpenAPI response model. Timestamps are serialized to ISO strings (see
 * `serialize` below) so the generated client sees `string`, not `Date`.
 */
const ProductModel = t.Object({
  id: t.String(),
  slug: t.String(),
  name: t.String(),
  description: t.Nullable(t.String()),
  priceCents: Int,
  currency: t.String(),
  stock: Int,
  active: t.Boolean(),
  createdAt: t.String({ format: "date-time" }),
  updatedAt: t.String({ format: "date-time" }),
});

function serialize(p: Product) {
  return {
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export const productsRoutes = new Elysia({ prefix: "/products", tags: ["Products"] })
  .get(
    "/",
    async () => {
      const rows = await db
        .select()
        .from(products)
        .where(eq(products.active, true));
      return rows.map(serialize);
    },
    {
      response: { 200: t.Array(ProductModel) },
      detail: { summary: "List active products" },
    },
  )
  .get(
    "/:slug",
    async ({ params, status }) => {
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.slug, params.slug))
        .limit(1);
      if (!product) return status(404, { message: "Product not found" });
      return serialize(product);
    },
    {
      params: t.Object({ slug: t.String() }),
      response: {
        200: ProductModel,
        404: t.Object({ message: t.String() }),
      },
      detail: { summary: "Get a product by slug" },
    },
  );
