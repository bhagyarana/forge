// packages/orchestrator/src/guards.test.ts — one test per TG-n, transition AND refusal.
// This is the checkpoint Ph1.3 is graded on (TASKLIST.md Ph1.3, 16 §8.2).
import { describe, expect, it } from "vitest";
import type {
  Capability,
  CapabilityMap,
  CoverageAssessment,
  Gap,
  Run,
  Scenario,
  TestPlan,
} from "@forge/core";
import {
  afterCritique,
  afterLapping,
  allTerminal,
  canAutoHeal,
  canCritique,
  canReplan,
  canStartLapping,
  canStartPlanning,
  ensureCapabilities,
  everyStateSigned,
  exitCodeFor,
  rankCapabilities,
  resolveLiveValidation,
  canStartExploring,
  verificationPasses,
} from "./guards.js";
import { COVERAGE_FLOOR, MAX_REPLAN_ROUNDS } from "./constants.js";

const ISO = "2026-01-01T00:00:00.000Z";
const idGen = { next: (p: string) => `${p}_guardtest01` };

function riskFactors() {
  return {
    authProximity: 0.5,
    dataMutation: 0.5,
    moneyOrPii: 0.5,
    graphCentrality: 0.5,
    affordanceDensity: 0.5,
    statedIntent: 0.5,
  };
}

function capability(overrides: Partial<Capability> = {}): Capability {
  return {
    id: "cap_abcdefgh12",
    sessionId: "ses_abcdefgh12",
    name: "Checkout",
    description: "The purchase flow end to end.",
    entryStateId: "st_abcdefgh12",
    stateIds: ["st_abcdefgh12"],
    exitConditions: ["order confirmed"],
    dependsOn: [],
    risk: { score: 0.8, factors: riskFactors() },
    priorityRank: 0,
    ...overrides,
  };
}

function emptyMap(overrides: Partial<CapabilityMap> = {}): CapabilityMap {
  return {
    sessionId: "ses_abcdefgh12",
    authenticated: true,
    states: [],
    transitions: [],
    capabilities: [],
    apiHints: [],
    frontier: { discovered: 0, explored: 0, haltReason: "EXHAUSTED" },
    ...overrides,
  };
}

// ── TG-1 ─────────────────────────────────────────────────────────────────
describe("TG-1 · CREATED → EXPLORING", () => {
  it("fires for an http(s) url on an allowed host", () => {
    expect(canStartExploring("http://localhost:4100/", ["localhost"])).toEqual({ ok: true });
  });

  it("refuses a non-http(s) scheme", () => {
    const result = canStartExploring("ftp://localhost/", ["localhost"]);
    expect(result.ok).toBe(false);
  });

  it("refuses a host outside the allowlist", () => {
    const result = canStartExploring("https://evil.example/", ["localhost", "127.0.0.1"]);
    expect(result.ok).toBe(false);
  });
});

// ── TG-2 ─────────────────────────────────────────────────────────────────
describe("TG-2 · EXPLORING → PRIORITISING", () => {
  it("passes an unmodified map through when capabilities exist", () => {
    const map = emptyMap({ capabilities: [capability()] });
    expect(ensureCapabilities(map, idGen)).toBe(map);
  });

  it("degrades zero capabilities to one synthetic capability — never ERROR", () => {
    const map = emptyMap();
    const result = ensureCapabilities(map, idGen);
    expect(result.capabilities).toHaveLength(1);
    expect(result.capabilities[0]?.name).toBe("Entry point");
  });

  it("every state carries a 16-char signature", () => {
    const map = emptyMap({
      states: [
        {
          id: "st_abcdefgh12",
          sessionId: "ses_abcdefgh12",
          signature: "0123456789abcdef",
          url: "https://shop.test/",
          title: "Home",
          authRequired: false,
          snapshotEvidenceId: "ev_abcdefgh12",
          affordanceIds: [],
          visitedVariants: 1,
          discoveredAt: ISO,
        },
      ],
    });
    expect(everyStateSigned(map)).toBe(true);
  });
});

// ── TG-3 ─────────────────────────────────────────────────────────────────
describe("TG-3 · PRIORITISING → LAPPING", () => {
  it("fires when the backlog is non-empty", () => {
    expect(canStartLapping([capability()])).toBe(true);
  });

  it("refuses an empty backlog", () => {
    expect(canStartLapping([])).toBe(false);
  });

  it("ranking is identical across five invocations on one fixture map", () => {
    const caps = [
      capability({ id: "cap_a0000000001", risk: { score: 0.5, factors: riskFactors() } }),
      capability({ id: "cap_b0000000002", risk: { score: 0.9, factors: riskFactors() } }),
      capability({ id: "cap_c0000000003", risk: { score: 0.9, factors: riskFactors() } }),
    ];
    const orders = Array.from({ length: 5 }, () => rankCapabilities(caps).map((c) => c.id));
    expect(new Set(orders.map((o) => o.join(","))).size).toBe(1);
    expect(orders[0]).toEqual(["cap_b0000000002", "cap_c0000000003", "cap_a0000000001"]);
  });
});

// ── TG-4 ─────────────────────────────────────────────────────────────────
describe("TG-4 · LAP_PENDING → PLANNING", () => {
  it("fires when every dependency is already banked", () => {
    expect(canStartPlanning(["cap_dep000001"], new Set(["cap_dep000001"]))).toBe(true);
  });

  it("refuses when a dependency is not yet banked", () => {
    expect(canStartPlanning(["cap_dep000001", "cap_dep000002"], new Set(["cap_dep000001"]))).toBe(
      false,
    );
  });
});

// ── TG-5a ────────────────────────────────────────────────────────────────
function groundedPlan(): { plan: TestPlan; map: CapabilityMap; affordances: [] } {
  const map = emptyMap({
    states: [
      {
        id: "st_abcdefgh12",
        sessionId: "ses_abcdefgh12",
        signature: "0123456789abcdef",
        url: "https://shop.test/",
        title: "Home",
        authRequired: false,
        snapshotEvidenceId: "ev_abcdefgh12",
        affordanceIds: [],
        visitedVariants: 1,
        discoveredAt: ISO,
      },
    ],
  });
  const plan: TestPlan = {
    id: "pln_abcdefgh12",
    lapId: "lap_abcdefgh12",
    capabilityId: "cap_abcdefgh12",
    round: 0,
    markdownPath: "plans/checkout.md",
    createdAt: ISO,
    scenarios: [
      {
        id: "SC-001",
        planId: "pln_abcdefgh12",
        title: "Visit home",
        class: "happy",
        priority: "P1",
        priorityReason: "entry point",
        preconditions: [],
        expectedOutcome: "home renders",
        source: "agent",
        sourceRefs: [],
        plannedNotGenerated: false,
        notGeneratedReason: null,
        version: 1,
        steps: [
          {
            id: "s1",
            order: 0,
            kind: "navigate",
            targetIntent: "go home",
            stateId: "st_abcdefgh12",
            affordanceRef: null,
            locator: null,
            input: null,
            timeoutMs: 5000,
            optional: false,
            fingerprintId: null,
            resolvedCount: null,
          },
        ],
      },
    ],
  };
  return { plan, map, affordances: [] };
}

describe("TG-5a · PLANNING → CRITIQUING", () => {
  it("fires when every step is grounded", () => {
    const { plan, map, affordances } = groundedPlan();
    expect(canCritique(plan, map, affordances).ok).toBe(true);
  });

  it("refuses a step citing an unobserved stateId — the model invented a button", () => {
    const { plan, map, affordances } = groundedPlan();
    const ungrounded: TestPlan = {
      ...plan,
      scenarios: [
        {
          ...(plan.scenarios[0] as Scenario),
          steps: [{ ...(plan.scenarios[0] as Scenario).steps[0]!, stateId: "st_unseen0000" }],
        },
      ],
    };
    expect(canCritique(ungrounded, map, affordances).ok).toBe(false);
  });
});

// ── TG-5b / TG-6 ───────────────────────────────────────────────────────────
function assessment(overrides: Partial<CoverageAssessment> = {}): CoverageAssessment {
  return {
    id: "cva_abcdefgh12",
    lapId: "lap_abcdefgh12",
    planId: "pln_abcdefgh12",
    round: 0,
    score: 0.85,
    floor: COVERAGE_FLOOR,
    structural: {
      affordancesExercised: 9,
      affordancesTotal: 21,
      transitionsTraversed: 5,
      transitionsTotal: 12,
      statesReached: 3,
      statesTotal: 4,
      classesPresent: ["happy"],
    },
    gaps: [],
    residualGaps: [],
    prdGaps: [],
    verdict: "PASS",
    source: "deterministic",
    createdAt: ISO,
    ...overrides,
  };
}

function blockerGap(): Gap {
  return {
    id: "gap_abcdefgh12",
    class: "MISSING_ERROR_STATE",
    title: "No error-state case",
    why: "the plan never exercises a failure path",
    severity: "BLOCKER",
    suggestedScenario: "simulate a network failure during checkout",
    affordanceRefs: [],
  };
}

describe("TG-5b · CRITIQUING → GENERATING | PLANNING (04 §3.3, verbatim)", () => {
  it("proceeds to GENERATING when the score clears the floor with zero blockers", () => {
    const result = afterCritique({ replanRounds: 0 }, assessment({ score: 0.7 }));
    expect(result.next).toBe("GENERATING");
  });

  it("a BLOCKER blocks even at score 1.0", () => {
    const result = afterCritique(
      { replanRounds: 0 },
      assessment({ score: 1.0, gaps: [blockerGap()] }),
    );
    expect(result.next).toBe("PLANNING");
  });

  it("the floor blocks with zero blockers below 0.70", () => {
    const result = afterCritique({ replanRounds: 0 }, assessment({ score: 0.6999 }));
    expect(result.next).toBe("PLANNING");
  });

  it("0.70 exactly clears the floor", () => {
    const result = afterCritique({ replanRounds: 0 }, assessment({ score: 0.7 }));
    expect(result.next).toBe("GENERATING");
  });

  it("after the round cap is spent, proceeds to GENERATING with accepted risk rather than looping", () => {
    const result = afterCritique(
      { replanRounds: MAX_REPLAN_ROUNDS },
      assessment({ score: 0.5, gaps: [blockerGap()] }),
    );
    expect(result.next).toBe("GENERATING");
    expect("acceptedRisk" in result && result.acceptedRisk).toHaveLength(1);
  });
});

describe("TG-6 · CRITIQUING → PLANNING (re-plan)", () => {
  it("permits a re-plan under the cap when the floor is not cleared", () => {
    expect(canReplan({ replanRounds: 1 }, assessment({ score: 0.5 }))).toBe(true);
  });

  it("refuses a third round — replanRounds 2 → the third round never happens", () => {
    expect(canReplan({ replanRounds: 2 }, assessment({ score: 0.5 }))).toBe(false);
  });

  it("refuses when the plan already clears the floor with no blocker", () => {
    expect(canReplan({ replanRounds: 0 }, assessment({ score: 0.9 }))).toBe(false);
  });
});

// ── TG-7 ─────────────────────────────────────────────────────────────────
function scenarioWithResolvedCount(resolvedCount: number | null): Scenario {
  return {
    id: "SC-001",
    planId: "pln_abcdefgh12",
    title: "Buy the thing",
    class: "happy",
    priority: "P1",
    priorityReason: "core flow",
    preconditions: [],
    expectedOutcome: "order placed",
    source: "agent",
    sourceRefs: [],
    plannedNotGenerated: false,
    notGeneratedReason: null,
    version: 1,
    steps: [
      {
        id: "s1",
        order: 0,
        kind: "click",
        targetIntent: "click buy",
        stateId: "st_abcdefgh12",
        affordanceRef: "af_abcdefgh12",
        locator: "getByRole('button')",
        input: null,
        timeoutMs: 5000,
        optional: false,
        fingerprintId: null,
        resolvedCount,
      },
    ],
  };
}

describe("TG-7 · GENERATING → RUNNING", () => {
  it("emits a scenario whose every locator resolves to exactly one element", () => {
    const result = resolveLiveValidation([scenarioWithResolvedCount(1)]);
    expect(result.emitted).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
  });

  it("drops a scenario resolving to 2 rather than taking the first", () => {
    const result = resolveLiveValidation([scenarioWithResolvedCount(2)]);
    expect(result.emitted).toHaveLength(0);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0]?.reason).toContain("2 element");
  });

  it("drops a scenario resolving to 0", () => {
    const result = resolveLiveValidation([scenarioWithResolvedCount(0)]);
    expect(result.dropped).toHaveLength(1);
  });
});

// ── TG-8 ─────────────────────────────────────────────────────────────────
function run(status: Run["status"]): Run {
  return {
    id: "run_abcdefgh12",
    lapId: "lap_abcdefgh12",
    scenarioId: "SC-001",
    status,
    attempt: 0,
    startedAt: ISO,
    finishedAt: ISO,
    durationMs: 100,
    verification: { healedStepRerun: false, fullFlowRerun: false },
    diagnosisSource: null,
  };
}

describe("TG-8 · RUNNING → BANKING", () => {
  it("a FLAKY scenario still reaches a terminal verdict", () => {
    expect(allTerminal([run("FLAKY")])).toBe(true);
  });

  it("refuses while a scenario is still RUNNING or QUEUED", () => {
    expect(allTerminal([run("VERIFIED"), run("RUNNING")])).toBe(false);
    expect(allTerminal([run("QUEUED")])).toBe(false);
  });
});

// ── TG-9 ─────────────────────────────────────────────────────────────────
describe("TG-9 · DECIDING → HEALING", () => {
  it("fires for a clean LOCATOR_BREAK under both caps", () => {
    expect(canAutoHeal({ kind: "LOCATOR_BREAK", vetoes: [] }, 0, 0)).toBe(true);
  });

  it("refuses when any of the three conditions is absent", () => {
    expect(canAutoHeal({ kind: "PRODUCT_BUG", vetoes: [] }, 0, 0)).toBe(false); // wrong kind
    expect(canAutoHeal({ kind: "LOCATOR_BREAK", vetoes: ["V2"] }, 0, 0)).toBe(false); // veto fired
    expect(canAutoHeal({ kind: "LOCATOR_BREAK", vetoes: [] }, 2, 0)).toBe(false); // step cap
    expect(canAutoHeal({ kind: "LOCATOR_BREAK", vetoes: [] }, 0, 3)).toBe(false); // lap cap
  });
});

// ── TG-10 ────────────────────────────────────────────────────────────────
describe("TG-10 · VERIFYING → BANKED(VERIFIED)", () => {
  it("fires when both the healed step and the full flow re-ran clean", () => {
    expect(verificationPasses({ healedStepRerun: true, fullFlowRerun: true })).toBe(true);
  });

  it("healedStepRerun true with fullFlowRerun false rolls back — not verified", () => {
    expect(verificationPasses({ healedStepRerun: true, fullFlowRerun: false })).toBe(false);
  });
});

// ── TG-11 ────────────────────────────────────────────────────────────────
describe("TG-11 · LAPPING → REPORTING", () => {
  it("fires when the backlog is empty", () => {
    expect(afterLapping(0, false)).toEqual({ next: "REPORTING", partial: false });
  });

  it("fires as a partial completion when the budget is exhausted with laps remaining", () => {
    expect(afterLapping(3, true)).toEqual({ next: "REPORTING", partial: true });
  });

  it("refuses (stays in LAPPING) while capabilities remain and the budget is intact — never ERROR", () => {
    expect(afterLapping(2, false)).toBeNull();
  });
});

// ── Exit code mapping — 04 §3.4 ────────────────────────────────────────────
describe("exitCodeFor — the W-5 ruling", () => {
  it("COMPLETED with no defects exits 0", () => {
    expect(exitCodeFor("COMPLETED", 0)).toBe(0);
  });
  it("COMPLETED with a found defect exits 1 — a success of the product", () => {
    expect(exitCodeFor("COMPLETED", 1)).toBe(1);
  });
  it("COMPLETED_PARTIAL follows the same defect rule", () => {
    expect(exitCodeFor("COMPLETED_PARTIAL", 0)).toBe(0);
    expect(exitCodeFor("COMPLETED_PARTIAL", 2)).toBe(1);
  });
  it("ESCALATED always exits 2", () => {
    expect(exitCodeFor("ESCALATED", 0)).toBe(2);
  });
  it("ERROR always exits 3", () => {
    expect(exitCodeFor("ERROR", 0)).toBe(3);
  });
});
