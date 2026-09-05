// packages/orchestrator/src/replan.test.ts — I-12: Lap.replanRounds ≤ 2, enforced by
// the FSM guard AND the store's CHECK constraint (see also packages/store/src/laps.test.ts).
import { describe, expect, it } from "vitest";
import type { CoverageAssessment, Gap } from "@forge/core";
import { afterCritique, canReplan } from "./guards.js";
import { COVERAGE_FLOOR, MAX_REPLAN_ROUNDS } from "./constants.js";

const ISO = "2026-01-01T00:00:00.000Z";

function blocker(): Gap {
  return {
    id: "gap_abcdefgh12",
    class: "MISSING_ERROR_STATE",
    title: "no error-state case",
    why: "the plan is happy-path only",
    severity: "BLOCKER",
    suggestedScenario: "simulate a failure",
    affordanceRefs: [],
  };
}

function failingAssessment(round: number): CoverageAssessment {
  return {
    id: "cva_abcdefgh12",
    lapId: "lap_abcdefgh12",
    planId: "pln_abcdefgh12",
    round,
    score: 0.4,
    floor: COVERAGE_FLOOR,
    structural: {
      affordancesExercised: 1,
      affordancesTotal: 10,
      transitionsTraversed: 0,
      transitionsTotal: 5,
      statesReached: 1,
      statesTotal: 3,
      classesPresent: ["happy"],
    },
    gaps: [blocker()],
    residualGaps: [],
    prdGaps: [],
    verdict: "REPLAN",
    source: "deterministic",
    createdAt: ISO,
  };
}

describe("I-12 — replanRounds is capped at 2, enforced by the FSM guard", () => {
  it("round 0 → round 1 is permitted", () => {
    expect(canReplan({ replanRounds: 0 }, failingAssessment(0))).toBe(true);
    expect(afterCritique({ replanRounds: 0 }, failingAssessment(0))).toEqual({
      next: "PLANNING",
      carry: [blocker()],
      replanRounds: 1,
    });
  });

  it("round 1 → round 2 is permitted", () => {
    expect(canReplan({ replanRounds: 1 }, failingAssessment(1))).toBe(true);
  });

  it("round 2 → round 3 never happens — the cap yields ACCEPT_RISK, not a silent pass", () => {
    expect(canReplan({ replanRounds: MAX_REPLAN_ROUNDS }, failingAssessment(2))).toBe(false);
    const transition = afterCritique({ replanRounds: MAX_REPLAN_ROUNDS }, failingAssessment(2));
    expect(transition.next).toBe("GENERATING");
    expect("acceptedRisk" in transition && transition.acceptedRisk).toEqual([blocker()]);
  });

  it("MAX_REPLAN_ROUNDS is exactly 2 — FR-305", () => {
    expect(MAX_REPLAN_ROUNDS).toBe(2);
  });
});
