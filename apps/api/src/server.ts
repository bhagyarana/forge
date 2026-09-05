// apps/api/src/server.ts — createApiServer(): the Fastify factory. Injectable dbPath
// and RunContext so packages/evals can boot this in-process against a temp db and a
// seeded, replayable clock/rng/idGen (16 §7) — the same surface a human drives.
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { seededRunContext, type RunContext } from "@forge/core";
import { closeDb, openDb } from "@forge/store";
import { sendError } from "./errors.js";
import type { ApiServerDeps } from "./types.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerLapRoutes } from "./routes/laps.js";
import { registerMapRoutes } from "./routes/map.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerStreamRoutes } from "./routes/stream.js";
import { registerStubRoutes } from "./routes/stubs.js";

export type ApiServerOptions = {
  dbPath: string;
  allowedHosts?: string[];
  runContext?: RunContext;
  repoRoot?: string;
};

export type { ApiServerDeps };

function defaultAllowedHosts(): string[] {
  return (process.env.FORGE_ALLOWED_HOSTS ?? "localhost,127.0.0.1").split(",").map((h) => h.trim());
}

export function createApiServer(opts: ApiServerOptions): FastifyInstance {
  const db = openDb(opts.dbPath);
  const runContext =
    opts.runContext ?? seededRunContext(Number(process.env.FORGE_SEED ?? 20260905));
  const deps: ApiServerDeps = {
    db,
    runContext,
    allowedHosts: opts.allowedHosts ?? defaultAllowedHosts(),
    repoRoot: opts.repoRoot ?? process.cwd(),
  };

  const app = Fastify({ logger: false });

  app.setErrorHandler((err: FastifyError, _request, reply) => {
    sendError(reply, "INTERNAL", err.message);
  });

  app.setNotFoundHandler((_request, reply) => {
    sendError(reply, "NOT_FOUND", "no such route");
  });

  registerHealthRoutes(app, deps);
  registerSessionRoutes(app, deps);
  registerStreamRoutes(app, deps);
  registerMapRoutes(app, deps);
  registerLapRoutes(app, deps);
  registerStubRoutes(app);

  app.addHook("onClose", (_instance, done) => {
    closeDb(db);
    done();
  });

  return app;
}
