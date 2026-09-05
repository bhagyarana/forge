// packages/orchestrator/src/scheduler.test.ts — a stubbed session runs start to finish
// through the real FSM, persisted and replayable (Ph1 exit gate).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seededRunContext, type RunContext } from "@forge/core";
import { closeDb, listEvents, listLaps, openDb, type Db } from "@forge/store";
import { runSession, resumeSession } from "./scheduler.js";
import { isTerminalSessionStatus } from "./session-machine.js";

describe("runSession — the Ph1 stub pipeline end to end", () => {
  let db: Db;
  let ctx: RunContext;

  beforeEach(() => {
    db = openDb(":memory:");
    ctx = seededRunContext(20260905, "2026-01-01T00:00:00.000Z");
  });
  afterEach(() => {
    closeDb(db);
  });

  it("reaches COMPLETED with exit 0, every lap BANKED with one outcome — I-15", async () => {
    const session = await runSession(
      {
        url: "https://shop.test",
        mode: "autopilot",
        budget: { maxCapabilities: 20, maxDurationMs: 1_800_000, maxUsd: 2 },
      },
      { db, ...ctx },
    );

    expect(session.status).toBe("COMPLETED");
    expect(session.exitCode).toBe(0);
    expect(session.finishedAt).not.toBeNull();
    expect(isTerminalSessionStatus(session.status)).toBe(true);

    const laps = listLaps(db, session.id);
    expect(laps.length).toBeGreaterThan(0);
    for (const lap of laps) {
      expect(lap.status).toBe("BANKED");
      expect(lap.outcome).not.toBeNull();
      expect(lap.bankedAt).not.toBeNull();
    }
  });

  it("persists every transition before it is emitted — the event log tells the same story", async () => {
    const session = await runSession(
      {
        url: "https://shop.test",
        mode: "autopilot",
        budget: { maxCapabilities: 20, maxDurationMs: 1, maxUsd: 1 },
      },
      { db, ...ctx },
    );
    const events = listEvents(db, session.id);
    expect(events.length).toBeGreaterThan(0);
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i)); // gapless — I-1
    expect(events[0]?.type).toBe("session.started");
    expect(events.at(-1)?.type).toBe("session.finished");
  });

  it("running the same input twice from a fresh, identically seeded context yields the same verdict shape", async () => {
    const input = {
      url: "https://shop.test",
      mode: "autopilot" as const,
      budget: { maxCapabilities: 20, maxDurationMs: 1, maxUsd: 1 },
    };

    const dbA = openDb(":memory:");
    const sessionA = await runSession(input, {
      db: dbA,
      ...seededRunContext(20260905, "2026-01-01T00:00:00.000Z"),
    });
    const lapsA = listLaps(dbA, sessionA.id).map((l) => ({ status: l.status, outcome: l.outcome }));
    closeDb(dbA);

    const dbB = openDb(":memory:");
    const sessionB = await runSession(input, {
      db: dbB,
      ...seededRunContext(20260905, "2026-01-01T00:00:00.000Z"),
    });
    const lapsB = listLaps(dbB, sessionB.id).map((l) => ({ status: l.status, outcome: l.outcome }));
    closeDb(dbB);

    expect(sessionA.status).toBe(sessionB.status);
    expect(sessionA.exitCode).toBe(sessionB.exitCode);
    expect(lapsA).toEqual(lapsB);
  });
});

describe("resumeSession — FR-903: a kill-and-restart mid-session resumes on the same lap", () => {
  it("does not re-run an already-banked lap, and the event log continues rather than restarting", async () => {
    const db = openDb(":memory:");
    const ctx = seededRunContext(20260905, "2026-01-01T00:00:00.000Z");
    const input = {
      url: "https://shop.test",
      mode: "autopilot" as const,
      budget: { maxCapabilities: 20, maxDurationMs: 1, maxUsd: 1 },
    };

    // "Kill" the process after the first lap banks — nothing past that point is
    // persisted, exactly like an OS process kill (04 §7, FR-903).
    const midway = await runSession(input, { db, ...ctx }, { stopAfterLapsBanked: 1 });
    expect(midway.status).toBe("LAPPING");
    const lapsAfterKill = listLaps(db, midway.id);
    const firstBanked = lapsAfterKill.find((l) => l.status === "BANKED");
    expect(firstBanked).toBeDefined();
    const bankedAtBeforeResume = firstBanked?.bankedAt;
    const eventsBeforeResume = listEvents(db, midway.id);

    // "Restart" — a fresh call against the SAME db, with no `stopAfterLapsBanked`.
    const resumed = await resumeSession(midway.id, { db, ...ctx });

    expect(resumed.status).toBe("COMPLETED");
    const lapsAfterResume = listLaps(db, midway.id);
    const sameLap = lapsAfterResume.find((l) => l.id === firstBanked?.id);
    expect(sameLap?.bankedAt).toBe(bankedAtBeforeResume); // never re-run

    const eventsAfterResume = listEvents(db, midway.id);
    expect(eventsAfterResume.slice(0, eventsBeforeResume.length)).toEqual(eventsBeforeResume);
    expect(eventsAfterResume.length).toBeGreaterThan(eventsBeforeResume.length); // continues, not restarts

    closeDb(db);
  });
});
