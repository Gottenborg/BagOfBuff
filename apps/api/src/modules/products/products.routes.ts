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

const NotFound = t.Object({ message: t.String() });

/** Fields accepted when creating a product. */
const CreateProductBody = t.Object({
  slug: t.String({ minLength: 1 }),
  name: t.String({ minLength: 1 }),
  description: t.Optional(t.Nullable(t.String())),
  priceCents: t.Integer({ minimum: 0 }),
  currency: t.Optional(t.String({ minLength: 3, maxLength: 3 })),
  stock: t.Optional(t.Integer({ minimum: 0 })),
  active: t.Optional(t.Boolean()),
});

/** Fields accepted when updating a product — all optional. */
const UpdateProductBody = t.Partial(
  t.Object({
    slug: t.String({ minLength: 1 }),
    name: t.String({ minLength: 1 }),
    description: t.Nullable(t.String()),
    priceCents: t.Integer({ minimum: 0 }),
    currency: t.String({ minLength: 3, maxLength: 3 }),
    stock: t.Integer({ minimum: 0 }),
    active: t.Boolean(),
  }),
);

function serialize(p: Product) {
  return {
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
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

export const productsRoutes = new Elysia({
  prefix: "/products",
  tags: ["Products"],
})
  // --- Public reads -------------------------------------------------------
  .get(
    "/",
    async ({ query }) => {
      const rows = query.includeInactive
        ? await db.select().from(products)
        : await db.select().from(products).where(eq(products.active, true));
      return rows.map(serialize);
    },
    {
      // `includeInactive` returns drafts too; it must be admin-gated (BAG-12).
      query: t.Object({ includeInactive: t.Optional(t.Boolean()) }),
      response: { 200: t.Array(ProductModel) },
      detail: { summary: "List products (active only unless includeInactive)" },
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
      response: { 200: ProductModel, 404: NotFound },
      detail: { summary: "Get a product by slug" },
    },
  )
  // --- Admin writes (to be protected in BAG-12) ---------------------------
  .post(
    "/",
    async ({ body, status }) => {
      try {
        const [created] = await db
          .insert(products)
          .values(body)
          .returning();
        return status(201, serialize(created!));
      } catch (err) {
        if (isUniqueViolation(err)) {
          return status(409, { message: "A product with that slug already exists" });
        }
        throw err;
      }
    },
    {
      body: CreateProductBody,
      response: {
        201: ProductModel,
        409: t.Object({ message: t.String() }),
      },
      detail: { summary: "Create a product (admin)" },
    },
  )
  .patch(
    "/:id",
    async ({ params, body, status }) => {
      try {
        const [updated] = await db
          .update(products)
          .set({ ...body, updatedAt: new Date() })
          .where(eq(products.id, params.id))
          .returning();
        if (!updated) return status(404, { message: "Product not found" });
        return serialize(updated);
      } catch (err) {
        if (isUniqueViolation(err)) {
          return status(409, { message: "A product with that slug already exists" });
        }
        throw err;
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: UpdateProductBody,
      response: {
        200: ProductModel,
        404: NotFound,
        409: t.Object({ message: t.String() }),
      },
      detail: { summary: "Update a product (admin)" },
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
      return serialize(archived);
    },
    {
      params: t.Object({ id: t.String() }),
      response: { 200: ProductModel, 404: NotFound },
      detail: { summary: "Archive a product (admin)" },
    },
  );
