// apps/api/src/routes/sessions.ts — 17 §3: session lifecycle.
import type { FastifyInstance } from "fastify";
import { SessionInput } from "@forge/core";
import {
  beginSession,
  canStartExploring,
  isTerminalSessionStatus,
  resumeSession,
} from "@forge/orchestrator";
import { getSession, listSessions, updateSessionStatus } from "@forge/store";
import type { ApiServerDeps } from "../types.js";
import { sendError } from "../errors.js";

export function registerSessionRoutes(app: FastifyInstance, deps: ApiServerDeps): void {
  app.post("/api/sessions", async (request, reply) => {
    const parsed = SessionInput.safeParse(request.body);
    if (!parsed.success) {
      return sendError(
        reply,
        "VALIDATION_FAILED",
        "url must be a valid http(s) URL",
        parsed.error.issues.map((issue) => ({
          path: issue.path,
          code: issue.code,
          message: issue.message,
        })),
      );
    }

    const input = parsed.data;
    const guard = canStartExploring(input.url, deps.allowedHosts); // TG-1
    if (!guard.ok) {
      return sendError(reply, "HOST_NOT_ALLOWED", guard.reason);
    }

    // FR-006, I-16: password is accepted at the boundary and never travels further.
    const withoutPassword = {
      url: input.url,
      username: input.username,
      prd: input.prd,
      intent: input.intent,
      mode: input.mode,
      budget: input.budget,
    };

    const session = beginSession(withoutPassword, { db: deps.db, ...deps.runContext });

    // 201 returns before exploration starts, and exploration starts anyway — FR-002.
    void resumeSession(session.id, { db: deps.db, ...deps.runContext }).catch((err: unknown) => {
      request.log.error({ err, sessionId: session.id }, "session pipeline failed");
    });

    return reply
      .code(201)
      .header("Location", `/api/sessions/${session.id}`)
      .send({ ...session, stream: `/api/sessions/${session.id}/stream` });
  });

  app.get("/api/sessions", async () => ({ sessions: listSessions(deps.db) }));

  app.get<{ Params: { id: string } }>("/api/sessions/:id", async (request, reply) => {
    const session = getSession(deps.db, request.params.id);
    if (!session) return sendError(reply, "NOT_FOUND", `no such session: ${request.params.id}`);
    return session;
  });

  app.post<{ Params: { id: string } }>("/api/sessions/:id/cancel", async (request, reply) => {
    const session = getSession(deps.db, request.params.id);
    if (!session) return sendError(reply, "NOT_FOUND", `no such session: ${request.params.id}`);
    if (isTerminalSessionStatus(session.status)) {
      return sendError(reply, "INVALID_STATE", "session is already in a terminal state");
    }
    return updateSessionStatus(deps.db, session.id, "COMPLETED_PARTIAL", {
      exitCode: 0,
      finishedAt: deps.runContext.clock.now().toISOString(),
    });
  });
}
