// apps/api/src/routes/map.ts — 17 §5: exploration reads.
import type { FastifyInstance } from "fastify";
import {
  listCapabilities,
  listTransitions,
  loadStatesWithAffordanceIds,
  getSession,
} from "@forge/store";
import type { ApiServerDeps } from "../types.js";
import { sendError } from "../errors.js";

export function registerMapRoutes(app: FastifyInstance, deps: ApiServerDeps): void {
  app.get<{ Params: { id: string } }>("/api/sessions/:id/map", async (request, reply) => {
    const session = getSession(deps.db, request.params.id);
    if (!session) return sendError(reply, "NOT_FOUND", `no such session: ${request.params.id}`);

    const states = loadStatesWithAffordanceIds(deps.db, session.id);
    if (states.length === 0) {
      return sendError(reply, "NOT_FOUND", "exploration has not produced a map yet");
    }

    return {
      sessionId: session.id,
      authenticated: session.authenticated,
      states,
      transitions: listTransitions(deps.db, session.id),
      capabilities: listCapabilities(deps.db, session.id),
      apiHints: [],
      frontier: { discovered: states.length, explored: states.length, haltReason: "EXHAUSTED" },
    };
  });

  app.get<{ Params: { id: string } }>("/api/sessions/:id/capabilities", async (request, reply) => {
    const session = getSession(deps.db, request.params.id);
    if (!session) return sendError(reply, "NOT_FOUND", `no such session: ${request.params.id}`);
    return { capabilities: listCapabilities(deps.db, session.id) };
  });
}
