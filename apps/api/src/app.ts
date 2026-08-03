import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { env } from "./lib/env";
import { authRoutes } from "./modules/auth/auth.routes";
import { productsRoutes } from "./modules/products/products.routes";

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
  .get("/health", () => ({ status: "ok" as const }), {
    detail: { summary: "Health check", tags: ["System"] },
  })
  .use(authRoutes)
  .use(productsRoutes);

export type App = typeof app;
