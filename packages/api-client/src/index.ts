import createClient, { type Client } from "openapi-fetch";
import type { paths } from "./schema";

export type { paths } from "./schema";

/** A fully typed client bound to the Bag of Buff API's OpenAPI schema. */
export type ApiClient = Client<paths>;

export interface CreateApiClientOptions {
  /** Absolute base URL of the API, e.g. https://api.bagofbuff.com */
  baseUrl: string;
  /** Headers applied to every request (e.g. a Supabase auth token). */
  headers?: Record<string, string>;
  /** Override fetch (useful for SSR request forwarding). */
  fetch?: typeof globalThis.fetch;
}

/**
 * Creates a typed API client. Instantiate once per app with the API URL from
 * that app's environment; both the storefront and the back office share these
 * types via the monorepo, so the API is the single source of truth.
 */
export function createApiClient(options: CreateApiClientOptions): ApiClient {
  return createClient<paths>({
    baseUrl: options.baseUrl,
    headers: options.headers,
    fetch: options.fetch,
  });
}
