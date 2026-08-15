import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "./db";
import { env } from "./lib/env";
import { adminsRoutes } from "./modules/auth/admins.routes";
import { authRoutes } from "./modules/auth/auth.routes";
import { checkoutRoutes } from "./modules/checkout/checkout.routes";
import { customersRoutes } from "./modules/customers/customers.routes";
import { ordersRoutes } from "./modules/orders/orders.routes";
import { productsRoutes } from "./modules/products/products.routes";
import { stockRoutes } from "./modules/products/stock.routes";
import { taxRoutes } from "./modules/orders/tax.routes";
import { shippingRoutes } from "./modules/shipping/shipping.routes";
import { subscriptionsRoutes } from "./modules/subscriptions/subscriptions.routes";

/**
 * Rejects if `promise` doesn't settle within `ms`. A misconfigured or
 * unreachable database can hang a connection attempt for a long time; the
 * health check must fail fast rather than hang.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * The Elysia application. Exported separately from the server bootstrap so it
 * can be reused for OpenAPI spec export and (later) tests without binding a
 * port. The OpenAPI document is served at `/openapi/json`.
 */
export const app = new Elysia()
  .use(cors({ origin: env.CORS_ORIGINS, credentials: true }))
  .use(
    openapi({
      documentation: {
        info: {
          title: "Bag of Buff API",
          version: "0.0.0",
          description: "Backend API for the Bag of Buff webshop.",
        },
      },
    }),
  )
  /**
   * Health check. This deliberately hits the database: an API that is running
   * but cannot reach Postgres is not healthy, and reporting "ok" in that state
   * hides real outages (every data route 500s while this says everything is
   * fine). Returns 503 with the reason when the database is unreachable.
   */
  .get(
    "/health",
    async ({ status }) => {
      try {
        await withTimeout(db.execute(sql`select 1`), 5000);
        return { status: "ok" as const, database: "up" as const };
      } catch (err) {
        // Drizzle wraps driver errors ("Failed query: ..."), which hides the
        // actual cause — e.g. "password authentication failed". Prefer the
        // underlying cause so the response says what is actually wrong.
        const cause = err instanceof Error ? err.cause : undefined;
        const message =
          cause instanceof Error
            ? cause.message
            : err instanceof Error
              ? err.message
              : String(err);
        console.error("Health check: database unreachable:", message);
        return status(503, {
          status: "error" as const,
          database: "down" as const,
          message,
        });
      }
    },
    {
      response: {
        200: t.Object({
          status: t.Literal("ok"),
          database: t.Literal("up"),
        }),
        503: t.Object({
          status: t.Literal("error"),
          database: t.Literal("down"),
          message: t.String(),
        }),
      },
      detail: {
        summary: "Health check (verifies database connectivity)",
        tags: ["System"],
      },
    },
  )
  .use(authRoutes)
  .use(adminsRoutes)
  .use(productsRoutes)
  .use(stockRoutes)
  .use(shippingRoutes)
  .use(checkoutRoutes)
  .use(ordersRoutes)
  .use(taxRoutes)
  .use(customersRoutes)
  .use(subscriptionsRoutes);

export type App = typeof app;
