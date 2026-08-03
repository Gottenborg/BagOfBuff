/**
 * Runtime environment configuration.
 *
 * DATABASE_URL should be the Supabase Postgres connection string. Use the
 * connection pooler URL (port 6543) in serverless/edge contexts; the pooler
 * requires `prepare: false` on the postgres.js client (see db/index.ts).
 */
export const env = {
  DATABASE_URL:
    process.env.DATABASE_URL ?? "postgres://localhost:5432/bagofbuff",
  PORT: Number(process.env.PORT ?? 3001),
  // Comma-separated list of allowed browser origins (shop + admin).
  CORS_ORIGINS: (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3002")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
} as const;
