import { describe, expect, test } from "bun:test";
import { sslForConnectionString } from "./pg-ssl";

/**
 * Supabase rejects plaintext connections (ESSLREQUIRED), and postgres.js does
 * not enable TLS on its own — a combination that produced a production failure
 * even with entirely valid credentials.
 */
describe("sslForConnectionString", () => {
  test("requires TLS for a Supabase pooler host", () => {
    expect(
      sslForConnectionString(
        "postgresql://postgres.ref:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres",
      ),
    ).toBe("require");
  });

  test("requires TLS for the Supabase direct host", () => {
    expect(
      sslForConnectionString(
        "postgresql://postgres:pw@db.abcdef.supabase.co:5432/postgres",
      ),
    ).toBe("require");
  });

  test("leaves local development alone", () => {
    expect(
      sslForConnectionString("postgres://localhost:5432/bagofbuff"),
    ).toBeUndefined();
    expect(
      sslForConnectionString("postgres://user:pw@127.0.0.1:5432/bagofbuff"),
    ).toBeUndefined();
  });

  test("defers to an explicit sslmode in the URL", () => {
    expect(
      sslForConnectionString(
        "postgresql://postgres.ref:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require",
      ),
    ).toBeUndefined();
    expect(
      sslForConnectionString(
        "postgresql://postgres.ref:pw@host.example.com:5432/postgres?sslmode=disable",
      ),
    ).toBeUndefined();
  });

  test("fails safe (requires TLS) when the URL cannot be parsed", () => {
    expect(sslForConnectionString("not a url")).toBe("require");
  });
});
