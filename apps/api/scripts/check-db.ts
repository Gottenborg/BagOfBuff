/**
 * Validates a Postgres connection string before you commit it to a secret.
 *
 *   bun run db:check                       # uses DATABASE_URL from the env
 *   DATABASE_URL="postgresql://…" bun run db:check
 *
 * Deploying a bad DATABASE_URL costs a full deploy cycle to discover, and the
 * failure ("password authentication failed") looks the same whether the
 * password is wrong or merely mis-encoded. This inspects the URL for the
 * mistakes that actually happen with Supabase, then makes a real connection and
 * translates the driver error into something you can act on.
 *
 * Exits 0 when the database is reachable, 1 otherwise. Never prints the
 * password.
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;

if (!url) {
  console.error("✗ DATABASE_URL is not set.\n");
  console.error("  Pass it inline:");
  console.error('    DATABASE_URL="postgresql://…" bun run db:check');
  process.exit(1);
}

// --- Static inspection ------------------------------------------------------
// Parse before connecting: several classic mistakes are visible in the string
// itself, and diagnosing them here is far clearer than a generic auth error.

const problems: string[] = [];
const notes: string[] = [];

let parsed: URL | undefined;
try {
  parsed = new URL(url);
} catch {
  problems.push(
    "The value is not a valid URL. If the password contains @ # ? / % or :, " +
      "each must be percent-encoded (@ → %40, # → %23, / → %2F, ? → %3F, % → %25, : → %3A).",
  );
}

if (parsed) {
  const user = decodeURIComponent(parsed.username);
  const host = parsed.hostname;
  const port = parsed.port || "5432";
  const rawPassword = parsed.password;

  console.log("Connection string:");
  console.log(`  user     ${user || "(none)"}`);
  console.log(`  host     ${host}`);
  console.log(`  port     ${port}`);
  console.log(`  database ${parsed.pathname.replace(/^\//, "") || "(none)"}`);
  console.log(`  password ${rawPassword ? `${rawPassword.length} chars` : "(none)"}`);
  console.log("");

  if (!rawPassword) {
    problems.push("No password in the URL.");
  }

  // Inspect the *raw* string, not parsed.password: the URL parser returns the
  // percent-encoded form, so a password containing a literal "@" reads back as
  // "%40" and would look correctly encoded when it is exactly the bug we are
  // hunting. Userinfo is everything between "://" and the last "@".
  const afterScheme = url.slice(url.indexOf("://") + 3);
  const lastAt = afterScheme.lastIndexOf("@");
  const rawUserinfo = lastAt >= 0 ? afterScheme.slice(0, lastAt) : "";
  const colon = rawUserinfo.indexOf(":");
  const rawPasswordSegment =
    colon >= 0 ? rawUserinfo.slice(colon + 1) : "";

  const unencoded = [..."@#?/"].filter((c) => rawPasswordSegment.includes(c));
  if (unencoded.length > 0) {
    problems.push(
      `The password contains ${unencoded.join(" ")} un-encoded, so the URL is ` +
        "parsed wrongly. Percent-encode it (@ → %40, # → %23, ? → %3F, / → %2F), " +
        "or use a password of only letters and digits.",
    );
  }
  if (
    rawPasswordSegment.includes("%") &&
    !/^(?:[^%]|%[0-9A-Fa-f]{2})*$/.test(rawPasswordSegment)
  ) {
    problems.push(
      "The password contains a % that is not a valid percent-escape " +
        "(a literal % must be written %25).",
    );
  }

  // Placeholders survive as %3C…%3E once parsed, so decode before checking.
  let decodedPassword = rawPasswordSegment;
  try {
    decodedPassword = decodeURIComponent(rawPasswordSegment);
  } catch {
    // Malformed escape — already reported above.
  }
  if (/[<>[\]]/.test(decodedPassword) || /password|your[-_]?db/i.test(decodedPassword)) {
    problems.push(
      "The password still looks like a placeholder — substitute the real one.",
    );
  }

  // Supabase routes pooler connections by a tenant-qualified username.
  const isPooler = host.includes("pooler.supabase.com");
  const isDirect = /^db\..*\.supabase\.co$/.test(host);

  if (isPooler && !user.includes(".")) {
    problems.push(
      `Pooler connections need the tenant-qualified username ` +
        `"postgres.<project-ref>", not "${user}".`,
    );
  }
  if (isPooler && port !== "6543" && port !== "5432") {
    notes.push(
      `Port ${port} is unusual for the pooler (6543 = transaction mode, 5432 = session mode).`,
    );
  }
  if (isDirect && user.includes(".")) {
    problems.push(
      `Direct connections use the plain username "postgres", not "${user}".`,
    );
  }
  if (isDirect) {
    notes.push(
      "This is the direct connection host. The pooler (…pooler.supabase.com:6543) " +
        "is recommended for the deployed API.",
    );
  }
}

if (problems.length > 0) {
  console.error("✗ Problems found in the connection string:\n");
  for (const p of problems) console.error(`  • ${p}`);
  console.error("");
  console.error(
    "  Copy the URI verbatim from Supabase → Connect → Connection pooling.",
  );
  process.exit(1);
}

for (const n of notes) console.log(`  note: ${n}`);
if (notes.length) console.log("");

// --- Live connection --------------------------------------------------------

console.log("Connecting…");

const sql = postgres(url, {
  prepare: false,
  connect_timeout: 10,
  // One connection, no retries: this is a check, not a workload.
  max: 1,
  idle_timeout: 5,
  onnotice: () => {},
});

try {
  const [row] = await sql`select current_user, version() as version`;
  const [tables] = await sql`
    select count(*)::int as n
    from information_schema.tables
    where table_schema = 'public'
  `;

  console.log("✓ Connected.\n");
  console.log(`  user   ${row?.current_user}`);
  console.log(`  server ${String(row?.version).split(" ").slice(0, 2).join(" ")}`);
  console.log(`  tables ${tables?.n} in public schema`);
  console.log("\nThis connection string is good — safe to use as DATABASE_URL.");
  await sql.end({ timeout: 5 });
  process.exit(0);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error("✗ Could not connect.\n");
  console.error(`  ${message}\n`);

  // Translate the common driver failures into the actual remedy.
  if (/password authentication failed|SASL|SCRAM/i.test(message)) {
    console.error("  The host is reachable but rejected the credentials:");
    console.error("    • the password is wrong, or");
    console.error("    • it needs percent-encoding (see above), or");
    console.error("    • the username doesn't match the connection mode.");
    console.error(
      "\n  Fix: Supabase → Project Settings → Database → Reset database password,",
    );
    console.error(
      "  then copy the URI from Connect → Connection pooling (Transaction, 6543).",
    );
  } else if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) {
    console.error("  The hostname could not be resolved — check it for typos.");
  } else if (/ECONNREFUSED|ETIMEDOUT|timeout/i.test(message)) {
    console.error(
      "  Could not reach the host on that port. Check the port (6543 pooler /",
    );
    console.error("  5432 direct) and that outbound access isn't blocked.");
  } else if (/Tenant or user not found/i.test(message)) {
    console.error(
      "  The pooler didn't recognise the tenant: the username must be",
    );
    console.error('  "postgres.<project-ref>" for pooler connections.');
  }

  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
}
