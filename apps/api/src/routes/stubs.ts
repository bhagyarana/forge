// apps/api/src/routes/stubs.ts — the endpoint groups from 17 §2 that depend on
// algorithms later phases build. The routes exist now, with the spec's real error
// shape, so the surface is complete; each returns real data once its owning phase
// lands: plans/assessments → Ph3, runs/steps → Ph4, diagnoses/patches → Ph5,
// report/score/suite.zip/gates/escalations → Ph6.
import type { FastifyInstance } from "fastify";
import { sendError } from "../errors.js";

const NOT_YET_IMPLEMENTED = "this endpoint's data does not exist until a later build phase";

export function registerStubRoutes(app: FastifyInstance): void {
  const notImplemented = async (_request: unknown, reply: import("fastify").FastifyReply) =>
    sendError(reply, "NOT_FOUND", NOT_YET_IMPLEMENTED);

  app.get("/api/laps/:lapId/plans/:round", notImplemented);
  app.get("/api/laps/:lapId/assessments/:round", notImplemented);
  app.get("/api/runs/:runId", notImplemented);
  app.get("/api/runs/:runId/steps/:stepId", notImplemented);
  app.get("/api/diagnoses/:id", notImplemented);
  app.get("/api/patches/:id", notImplemented);
  app.get("/api/evidence/:id", notImplemented);
  app.get("/api/evidence/:id/raw", notImplemented);
  app.get("/api/sessions/:id/report", notImplemented);
  app.get("/api/sessions/:id/score", notImplemented);
  app.get("/api/sessions/:id/suite.zip", notImplemented);
  app.get("/api/sessions/:id/gates", async () => ({ gates: [] })); // autopilot: always empty, 17 §6.1
  app.post("/api/gates/:gateId", notImplemented);
  app.get("/api/sessions/:id/escalations", async () => ({ escalations: [] }));
  app.post("/api/escalations/:id", notImplemented);
  app.post("/api/sessions/:id/scenarios", notImplemented);
}
