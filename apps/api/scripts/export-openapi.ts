/**
 * Exports the OpenAPI document to `openapi.json` at the API root without
 * binding a port, by handling an in-memory request against the Elysia app.
 * The typed API client (`packages/api-client`) generates its types from this
 * file, so run `bun run openapi:export` after changing routes.
 */
import { app } from "../src/app";

const res = await app.handle(
  new Request("http://localhost/openapi/json"),
);

if (!res.ok) {
  console.error(`Failed to fetch OpenAPI document: ${res.status}`);
  process.exit(1);
}

const spec = await res.json();
const outPath = new URL("../openapi.json", import.meta.url);
await Bun.write(outPath, JSON.stringify(spec, null, 2) + "\n");

console.log(`✅ Wrote OpenAPI spec to apps/api/openapi.json`);
