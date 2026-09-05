// apps/api/src/server.test.ts — Ph1.5: a stubbed session reaches a terminal state
// over the real HTTP surface (17 §3, §4, §8).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seededRunContext } from "@forge/core";
import { createApiServer } from "./server.js";
import type { FastifyInstance } from "fastify";

function tmpDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "forge-api-"));
  return join(dir, "forge.db");
}

async function waitForTerminal(
  app: FastifyInstance,
  sessionId: string,
  maxAttempts = 100,
): Promise<any> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await app.inject({ method: "GET", url: `/api/sessions/${sessionId}` });
    const body = res.json();
    if (["COMPLETED", "COMPLETED_PARTIAL", "ESCALATED", "ERROR"].includes(body.status)) return body;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`session ${sessionId} never reached a terminal state`);
}

describe("POST /api/sessions — the whole product in one call", () => {
  let app: FastifyInstance;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tmpDbPath();
    app = createApiServer({
      dbPath,
      allowedHosts: ["shop.test", "localhost"],
      runContext: seededRunContext(20260905, "2026-01-01T00:00:00.000Z"),
    });
  });
  afterEach(async () => {
    await app.close();
    rmSync(dbPath, { force: true });
  });

  it("accepts a bare url, returns 201 with a Location and stream url, never echoes password", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { url: "https://shop.test", password: "hunter2" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.headers.location).toMatch(/^\/api\/sessions\/ses_/);
    const body = res.json();
    expect(body.status).toBe("CREATED");
    expect(JSON.stringify(body)).not.toContain("hunter2");
    expect(JSON.stringify(body)).not.toContain("password");
    expect(body.stream).toBe(`/api/sessions/${body.id}/stream`);
  });

  it("rejects a body with no url — VALIDATION_FAILED with Zod issues", async () => {
    const res = await app.inject({ method: "POST", url: "/api/sessions", payload: {} });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(Array.isArray(body.error.issues)).toBe(true);
    expect(body.error.requestId).toBeTruthy();
  });

  it("refuses a host outside the allowlist — HOST_NOT_ALLOWED, a safety refusal stated as one", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { url: "https://evil.example" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("HOST_NOT_ALLOWED");
  });

  it("TG-1 fires within budget with no second call — the session reaches a terminal state on its own", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { url: "https://shop.test" },
    });
    const { id } = created.json();
    const finished = await waitForTerminal(app, id);
    expect(finished.status).toBe("COMPLETED");
    expect(finished.exitCode).toBe(0);
  });

  it("GET /api/sessions lists sessions; GET /api/sessions/:id 404s for an unknown id", async () => {
    await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { url: "https://shop.test" },
    });
    const list = await app.inject({ method: "GET", url: "/api/sessions" });
    expect(list.json().sessions.length).toBeGreaterThan(0);

    const missing = await app.inject({ method: "GET", url: "/api/sessions/ses_doesnotexist1" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe("NOT_FOUND");
  });

  it("cancelling a terminal session returns INVALID_STATE (409)", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { url: "https://shop.test" },
    });
    const { id } = created.json();
    await waitForTerminal(app, id);
    const cancel = await app.inject({ method: "POST", url: `/api/sessions/${id}/cancel` });
    expect(cancel.statusCode).toBe(409);
    expect(cancel.json().error.code).toBe("INVALID_STATE");
  });
});

describe("the event stream and its polling fallback", () => {
  let app: FastifyInstance;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tmpDbPath();
    app = createApiServer({
      dbPath,
      allowedHosts: ["shop.test"],
      runContext: seededRunContext(20260905, "2026-01-01T00:00:00.000Z"),
    });
  });
  afterEach(async () => {
    await app.close();
    rmSync(dbPath, { force: true });
  });

  it("a late joiner replays the whole log as SessionEvent envelopes, then the stream closes", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { url: "https://shop.test" },
    });
    const { id } = created.json();
    await waitForTerminal(app, id);

    const res = await app.inject({ method: "GET", url: `/api/sessions/${id}/stream` });
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.payload).toContain("event: session.started");
    expect(res.payload).toContain("event: session.finished");

    const dataLines = res.payload
      .split("\n")
      .filter((l) => l.startsWith("data: "))
      .map((l) => JSON.parse(l.slice("data: ".length)));
    expect(dataLines.map((e) => e.seq)).toEqual(dataLines.map((_, i) => i)); // gapless, ordered
    for (const event of dataLines) {
      expect(event.sessionId).toBe(id);
      expect(event.type).toBeTruthy();
      expect(event.actor).toBeTruthy();
    }
  });

  it("GET /events?since= only returns events after the given seq", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { url: "https://shop.test" },
    });
    const { id } = created.json();
    await waitForTerminal(app, id);

    const all = await app.inject({ method: "GET", url: `/api/sessions/${id}/events` });
    const total = all.json().events.length;

    const since = await app.inject({ method: "GET", url: `/api/sessions/${id}/events?since=0` });
    const body = since.json();
    expect(body.events.length).toBe(total - 1);
    expect(body.events[0].seq).toBe(1);
  });

  it("streaming an unknown session id is NOT_FOUND", async () => {
    const res = await app.inject({ method: "GET", url: "/api/sessions/ses_doesnotexist1/stream" });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /api/health and /api/doctor", () => {
  it("health reports ok; doctor returns 200 even when a check fails", async () => {
    const dbPath = tmpDbPath();
    const app = createApiServer({
      dbPath,
      runContext: seededRunContext(1, "2026-01-01T00:00:00.000Z"),
    });

    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json().ok).toBe(true);

    const doctor = await app.inject({ method: "GET", url: "/api/doctor" });
    expect(doctor.statusCode).toBe(200); // never 503 — a failing diagnostic is still a successful one
    expect(Array.isArray(doctor.json().checks)).toBe(true);

    await app.close();
    rmSync(dbPath, { force: true });
  });
});

describe("the endpoints that depend on later phases", () => {
  it("exist and return the spec's NOT_FOUND shape rather than 500ing", async () => {
    const dbPath = tmpDbPath();
    const app = createApiServer({
      dbPath,
      allowedHosts: ["shop.test"],
      runContext: seededRunContext(1, "2026-01-01T00:00:00.000Z"),
    });

    const report = await app.inject({
      method: "GET",
      url: "/api/sessions/ses_whatever0001/report",
    });
    expect(report.statusCode).toBe(404);
    expect(report.json().error.code).toBe("NOT_FOUND");

    const gates = await app.inject({ method: "GET", url: "/api/sessions/ses_whatever0001/gates" });
    expect(gates.json()).toEqual({ gates: [] }); // autopilot — always empty, 17 §6.1

    await app.close();
    rmSync(dbPath, { force: true });
  });
});
