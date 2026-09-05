// apps/api/src/index.ts — the process entrypoint. `createApiServer` (server.ts) is
// what packages/evals imports to boot the same server in-process against a temp db.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApiServer, type ApiServerDeps, type ApiServerOptions } from "./server.js";

export const FORGE_API_VERSION = "0.0.0";
export { createApiServer };
export type { ApiServerDeps, ApiServerOptions };

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");

async function main(): Promise<void> {
  const port = Number(process.env.FORGE_API_PORT ?? 4000);
  const host = process.env.FORGE_API_BIND ?? "127.0.0.1"; // loopback by default — 17 §9
  const app = createApiServer({
    dbPath: process.env.FORGE_DB_PATH ?? join(repoRoot, "artifacts", "forge.db"),
    repoRoot,
  });
  await app.listen({ port, host });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
