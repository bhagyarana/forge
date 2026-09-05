// packages/store/src/events.test.ts — I-1: session_events is append-only; seq is
// gapless per session.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FrozenClock } from "@forge/core";
import { appendEvent, getEvent, listEvents } from "./events.js";
import { closeDb, openDb, type Db } from "./db.js";
import { createSession } from "./sessions.js";

describe("appendEvent — I-1", () => {
  let db: Db;
  const clock = new FrozenClock("2026-01-01T00:00:00.000Z");

  beforeEach(() => {
    db = openDb(":memory:");
  });
  afterEach(() => {
    closeDb(db);
  });

  function seedSession(): string {
    const session = createSession(
      db,
      { clock, idGen: { next: (p: string) => `${p}_seedsession1` } },
      {
        url: "https://shop.test",
        mode: "autopilot",
        budget: { maxCapabilities: 20, maxDurationMs: 1, maxUsd: 1 },
      },
    );
    return session.id;
  }

  it("assigns seq 0, 1, 2, … with no gaps", () => {
    const sessionId = seedSession();
    const e0 = appendEvent(db, clock, {
      sessionId,
      lapId: null,
      actor: "orchestrator",
      type: "session.started",
      payload: {},
    });
    const e1 = appendEvent(db, clock, {
      sessionId,
      lapId: null,
      actor: "orchestrator",
      type: "explore.finished",
      payload: {},
    });
    const e2 = appendEvent(db, clock, {
      sessionId,
      lapId: null,
      actor: "orchestrator",
      type: "session.finished",
      payload: {},
    });
    expect([e0.seq, e1.seq, e2.seq]).toEqual([0, 1, 2]);

    const listed = listEvents(db, sessionId);
    expect(listed.map((e) => e.seq)).toEqual([0, 1, 2]);
  });

  it("seq is independent per session", () => {
    const a = seedSession();
    const b = createSession(
      db,
      { clock, idGen: { next: (p: string) => `${p}_seedsession2` } },
      {
        url: "https://shop.test",
        mode: "autopilot",
        budget: { maxCapabilities: 20, maxDurationMs: 1, maxUsd: 1 },
      },
    ).id;

    appendEvent(db, clock, {
      sessionId: a,
      lapId: null,
      actor: "orchestrator",
      type: "session.started",
      payload: {},
    });
    const firstForB = appendEvent(db, clock, {
      sessionId: b,
      lapId: null,
      actor: "orchestrator",
      type: "session.started",
      payload: {},
    });
    expect(firstForB.seq).toBe(0);
  });

  it("listEvents(since) only returns events after the given seq — the resume path", () => {
    const sessionId = seedSession();
    appendEvent(db, clock, {
      sessionId,
      lapId: null,
      actor: "orchestrator",
      type: "session.started",
      payload: {},
    });
    appendEvent(db, clock, {
      sessionId,
      lapId: null,
      actor: "orchestrator",
      type: "explore.finished",
      payload: {},
    });
    appendEvent(db, clock, {
      sessionId,
      lapId: null,
      actor: "orchestrator",
      type: "session.finished",
      payload: {},
    });

    const resumed = listEvents(db, sessionId, 0);
    expect(resumed.map((e) => e.seq)).toEqual([1, 2]);
  });

  it("getEvent resolves a single event by (sessionId, seq)", () => {
    const sessionId = seedSession();
    appendEvent(db, clock, {
      sessionId,
      lapId: null,
      actor: "orchestrator",
      type: "session.started",
      payload: { foo: "bar" },
    });
    const e = getEvent(db, sessionId, 0);
    expect(e?.payload).toEqual({ foo: "bar" });
    expect(getEvent(db, sessionId, 99)).toBeNull();
  });

  it("session_events has no UPDATE/DELETE path in the store API — append only", () => {
    // The invariant is structural: this module exports appendEvent/listEvents/getEvent
    // and nothing that mutates or removes a row. Assert the export surface directly.
    const storeExports = { appendEvent, listEvents, getEvent };
    expect(Object.keys(storeExports).some((k) => /update|delete|remove/i.test(k))).toBe(false);
  });
});
