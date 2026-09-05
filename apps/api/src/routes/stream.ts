// apps/api/src/routes/stream.ts — 17 §4: the event stream, and its polling fallback.
import type { FastifyInstance } from "fastify";
import { isTerminalSessionStatus } from "@forge/orchestrator";
import { getSession, listEvents } from "@forge/store";
import type { ApiServerDeps } from "../types.js";
import { sendError } from "../errors.js";

const HEARTBEAT_INTERVAL_MS = 15_000;
const POLL_INTERVAL_MS = 100;

export function registerStreamRoutes(app: FastifyInstance, deps: ApiServerDeps): void {
  app.get<{ Params: { id: string } }>("/api/sessions/:id/stream", async (request, reply) => {
    const session = getSession(deps.db, request.params.id);
    if (!session) return sendError(reply, "NOT_FOUND", `no such session: ${request.params.id}`);

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    });
    reply.raw.write("retry: 2000\n\n");

    const lastEventId = request.headers["last-event-id"];
    let cursor = typeof lastEventId === "string" ? Number(lastEventId) : -1;

    const flush = (): void => {
      for (const event of listEvents(deps.db, session.id, cursor)) {
        reply.raw.write(
          `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
        );
        cursor = event.seq;
      }
    };

    flush();

    if (isTerminalSessionStatus(getSession(deps.db, session.id)?.status ?? session.status)) {
      reply.raw.end(); // late-joiner: replay the whole log, then close — 17 §4.1
      return;
    }

    const heartbeat = setInterval(() => {
      reply.raw.write(": heartbeat\n\n");
    }, HEARTBEAT_INTERVAL_MS);

    const poll = setInterval(() => {
      flush();
      const current = getSession(deps.db, session.id);
      if (!current || isTerminalSessionStatus(current.status)) {
        clearInterval(heartbeat);
        clearInterval(poll);
        reply.raw.end();
      }
    }, POLL_INTERVAL_MS);

    request.raw.on("close", () => {
      clearInterval(heartbeat);
      clearInterval(poll);
    });
  });

  app.get<{
    Params: { id: string };
    Querystring: { since?: string; limit?: string };
  }>("/api/sessions/:id/events", async (request, reply) => {
    const session = getSession(deps.db, request.params.id);
    if (!session) return sendError(reply, "NOT_FOUND", `no such session: ${request.params.id}`);

    const since = request.query.since !== undefined ? Number(request.query.since) : -1;
    const limit = request.query.limit !== undefined ? Number(request.query.limit) : 200;
    const events = listEvents(deps.db, session.id, since, limit);
    return {
      events,
      nextSince: events.at(-1)?.seq ?? since,
      hasMore: events.length === limit,
    };
  });
}
