import { app } from "./app";
import { env } from "./lib/env";

app.listen(env.PORT);

console.log(`🦊 Bag of Buff API running at http://localhost:${env.PORT}`);
console.log(`📖 OpenAPI docs at http://localhost:${env.PORT}/openapi`);
