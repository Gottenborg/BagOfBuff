import { describe, expect, test } from "bun:test";

/**
 * The health endpoint is the signal we use to decide whether a deploy is good,
 * so it has to fail when the database is unreachable. It previously returned
 * {"status":"ok"} without touching Postgres, which made a completely broken
 * deployment (bad DATABASE_URL) look healthy.
 *
 * DATABASE_URL is set to an unroutable address before importing the app, so
 * these run without a real database.
 */
process.env.DATABASE_URL =
  "postgresql://postgres:wrong@127.0.0.1:59999/postgres";

const { app } = await import("./app");

describe("GET /health", () => {
  test("reports 503 and database:down when Postgres is unreachable", async () => {
    const res = await app.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(503);

    const body = (await res.json()) as {
      status: string;
      database: string;
      message: string;
    };
    expect(body.status).toBe("error");
    expect(body.database).toBe("down");
    // The reason must be specific enough to act on, not a generic wrapper.
    expect(body.message.length).toBeGreaterThan(0);
    expect(body.message).not.toBe("Failed query: select 1");
  });
});
