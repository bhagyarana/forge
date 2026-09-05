// apps/api/src/routes/laps.ts — 17 §5: lap reads.
import type { FastifyInstance } from "fastify";
import { getLap, getSession, listLaps } from "@forge/store";
import type { ApiServerDeps } from "../types.js";
import { sendError } from "../errors.js";

export function registerLapRoutes(app: FastifyInstance, deps: ApiServerDeps): void {
  app.get<{ Params: { id: string } }>("/api/sessions/:id/laps", async (request, reply) => {
    const session = getSession(deps.db, request.params.id);
    if (!session) return sendError(reply, "NOT_FOUND", `no such session: ${request.params.id}`);
    return { laps: listLaps(deps.db, session.id) };
  });

  app.get<{ Params: { lapId: string } }>("/api/laps/:lapId", async (request, reply) => {
    const lap = getLap(deps.db, request.params.lapId);
    if (!lap) return sendError(reply, "NOT_FOUND", `no such lap: ${request.params.lapId}`);
    return lap;
  });
}
