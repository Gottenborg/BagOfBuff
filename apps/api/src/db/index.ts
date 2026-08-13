import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../lib/env";
import { sslForConnectionString } from "../lib/pg-ssl";
import * as schema from "./schema";

/**
 * postgres.js is lazy — constructing the client does not open a connection, so
 * this is safe to import at build time / during OpenAPI export without a live
 * database. `prepare: false` is required when connecting through the Supabase
 * transaction pooler (pgBouncer), and TLS must be requested explicitly or
 * Supabase rejects the connection (ESSLREQUIRED).
 */
const client = postgres(env.DATABASE_URL, {
  prepare: false,
  ssl: sslForConnectionString(env.DATABASE_URL),
});

export const db = drizzle(client, { schema });

export { schema };
