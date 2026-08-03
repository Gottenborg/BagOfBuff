import { createApiClient } from "@repo/api-client";

/**
 * Typed API client for the storefront. `VITE_API_URL` is inlined into both the
 * client and SSR bundles at build time; falls back to the local API in dev.
 */
const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export const api = createApiClient({ baseUrl });
