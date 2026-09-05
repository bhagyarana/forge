// apps/api/src/types.ts — shared route-handler dependencies, split out from
// server.ts so route modules importing this type don't form an import cycle with
// the server module that registers them (dependency-cruiser's `no-circular`, 15 §2.2).
import type { RunContext } from "@forge/core";
import type { Db } from "@forge/store";

export type ApiServerDeps = {
  db: Db;
  runContext: RunContext;
  allowedHosts: string[];
  repoRoot: string;
};
