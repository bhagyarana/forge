// packages/store/src/laps.test.ts — I-12's DB backstop: replan_rounds CHECK (<= 2).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FrozenClock } from "@forge/core";
import { closeDb, openDb, type Db } from "./db.js";
import { createSession } from "./sessions.js";
import { bankLap, getLap, incrementReplanRounds, openLap, recordHealAttempt } from "./laps.js";

describe("laps", () => {
  let db: Db;
  const clock = new FrozenClock("2026-01-01T00:00:00.000Z");
  const idGen = { next: (p: string) => `${p}_labtestlap1` };

  beforeEach(() => {
    db = openDb(":memory:");
  });
  afterEach(() => {
    closeDb(db);
  });

  function seed(): { sessionId: string; capabilityId: string } {
    const sessionId = createSession(
      db,
      { clock, idGen },
      {
        url: "https://shop.test",
        mode: "autopilot",
        budget: { maxCapabilities: 1, maxDurationMs: 1, maxUsd: 1 },
      },
    ).id;
    db.prepare(
      `INSERT INTO capabilities (id, session_id, name, description, entry_state_id, risk_score, priority_rank, doc_json)
       VALUES ('cap_labtestcap1', ?, 'Checkout', 'the purchase flow', 'st_labteststate', 0.9, 0, '{}')`,
    ).run(sessionId);
    return { sessionId, capabilityId: "cap_labtestcap1" };
  }

  it("opens LAP_PENDING and banks with an outcome", () => {
    const { sessionId, capabilityId } = seed();
    const lap = openLap(db, { clock, idGen }, { sessionId, capabilityId, index: 0 });
    expect(lap.status).toBe("LAP_PENDING");
    expect(lap.replanRounds).toBe(0);

    const banked = bankLap(db, { clock }, lap.id, "VERIFIED");
    expect(banked.status).toBe("BANKED");
    expect(banked.outcome).toBe("VERIFIED");
    expect(banked.bankedAt).not.toBeNull();
  });

  it("replan_rounds accumulates and refuses a third round — I-12 DB backstop", () => {
    const { sessionId, capabilityId } = seed();
    const lap = openLap(db, { clock, idGen }, { sessionId, capabilityId, index: 0 });

    const afterOne = incrementReplanRounds(db, lap.id);
    expect(afterOne.replanRounds).toBe(1);
    const afterTwo = incrementReplanRounds(db, lap.id);
    expect(afterTwo.replanRounds).toBe(2);

    expect(() => incrementReplanRounds(db, lap.id)).toThrow();
    expect(getLap(db, lap.id)?.replanRounds).toBe(2); // the failed attempt did not partially apply
  });

  it("healAttempts accumulates per step", () => {
    const { sessionId, capabilityId } = seed();
    const lap = openLap(db, { clock, idGen }, { sessionId, capabilityId, index: 0 });
    recordHealAttempt(db, lap.id, "s4");
    const twice = recordHealAttempt(db, lap.id, "s4");
    expect(twice.healAttempts).toEqual({ s4: 2 });
  });
});
