/**
 * TLS policy for Postgres connections.
 *
 * postgres.js does not enable TLS unless asked, but Supabase (and managed
 * Postgres generally) refuses plaintext connections with:
 *
 *   (ESSLREQUIRED) SSL connection is required for user: postgres
 *
 * So default to requiring TLS for any remote host. Two escape hatches:
 * an explicit `sslmode` in the connection string wins (postgres.js parses it),
 * and local development against a plaintext server is left alone.
 *
 * Both the API and `bun run db:check` use this, so a connection string that
 * passes the check connects the same way in production.
 */
export type SslOption = "require" | undefined;

export function sslForConnectionString(url: string): SslOption {
  // An explicit sslmode in the URL is the operator's decision — don't override.
  if (/[?&]sslmode=/i.test(url)) return undefined;

  try {
    const host = new URL(url).hostname.toLowerCase();
    const isLocal =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "[::1]" ||
      host.endsWith(".local");
    return isLocal ? undefined : "require";
  } catch {
    // Unparseable URL: the caller reports that separately. Require TLS rather
    // than silently connecting in the clear.
    return "require";
  }
}
