// packages/core/schema/round-trip.test.ts — 05 §2: every entity parses and re-serialises unchanged.
import { describe, expect, it } from "vitest";
import { BBox, Confidence, Id, Iso, Severity, Viewport } from "./primitives.js";
import { ID_PREFIXES, ScenarioId, TestStepId, idWithPrefix } from "./id.js";
import { Session, SessionInput } from "./session.js";
import { Affordance, State, Transition } from "./perception.js";
import { Capability, CapabilityMap, RiskFactors } from "./capability.js";
import { Scenario, TestPlan, TestStep } from "./plan.js";
import { CoverageAssessment, Gap } from "./critique.js";
import { Lap } from "./lap.js";
import { Evidence, Run, SessionEvent } from "./run.js";
import { Diagnosis, ElementFingerprint, HealCandidate, TestPatch } from "./diagnose.js";
import { QualityReport, RobustnessScore, UntestedFlowRisk } from "./report.js";

const ISO = "2026-01-01T00:00:00.000Z";
const bbox: BBox = { x: 0, y: 0, w: 10, h: 10 };
const viewport: Viewport = { width: 1440, height: 900, deviceScaleFactor: 1 };
const riskFactors: RiskFactors = {
  authProximity: 0.5,
  dataMutation: 0.5,
  moneyOrPii: 0.5,
  graphCentrality: 0.5,
  affordanceDensity: 0.5,
  statedIntent: 0.5,
};

function roundTrips<T>(schema: { parse: (v: unknown) => T }, value: unknown) {
  const parsed = schema.parse(value);
  expect(parsed).toEqual(value);
  return parsed;
}

describe("primitives", () => {
  it("Id accepts the documented prefixes and rejects a bad one", () => {
    expect(Id.safeParse("ses_abcdefgh12").success).toBe(true);
    expect(Id.safeParse("SES_abcdefgh12").success).toBe(false); // must be lowercase
    expect(Id.safeParse("ses-abcdefgh12").success).toBe(false); // must use '_'
    expect(Id.safeParse("ses_short").success).toBe(false); // < 8 chars after '_'
  });

  it("Iso requires a real datetime string", () => {
    expect(Iso.safeParse(ISO).success).toBe(true);
    expect(Iso.safeParse("not-a-date").success).toBe(false);
  });

  it("Confidence and Severity round-trip", () => {
    expect(Confidence.parse(0.891)).toBe(0.891);
    expect(Severity.parse("BLOCKER")).toBe("BLOCKER");
  });
});

describe("id conventions — 05 §6", () => {
  it("every prefix mints an id the generic Id schema accepts", () => {
    for (const prefix of Object.values(ID_PREFIXES)) {
      const id = `${prefix}_01j9x2k4abc`;
      expect(Id.safeParse(id).success).toBe(true);
      expect(idWithPrefix(prefix).safeParse(id).success).toBe(true);
      expect(idWithPrefix(prefix).safeParse(`other_01j9x2k4abc`).success).toBe(false);
    }
  });

  it("Scenario and TestStep ids use their own human-facing formats", () => {
    expect(ScenarioId.safeParse("SC-014").success).toBe(true);
    expect(ScenarioId.safeParse("sc-014").success).toBe(false);
    expect(TestStepId.safeParse("s4").success).toBe(true);
    expect(TestStepId.safeParse("step4").success).toBe(false);
  });
});

describe("Session — the only required input is a URL", () => {
  it("SessionInput accepts a bare url", () => {
    const parsed = SessionInput.parse({ url: "https://shop.test" });
    expect(parsed.mode).toBe("autopilot");
    expect(parsed.budget.maxCapabilities).toBe(20);
  });

  it("Session round-trips and never carries a password field", () => {
    const session = roundTrips(Session, {
      id: "ses_abcdefgh12",
      input: {
        url: "https://shop.test",
        username: "ada",
        intent: "focus on checkout",
        mode: "autopilot",
        budget: { maxCapabilities: 20, maxDurationMs: 1_800_000, maxUsd: 2 },
      },
      status: "CREATED",
      authenticated: false,
      storageStatePath: null,
      exitCode: null,
      defectsFound: 0,
      createdAt: ISO,
      finishedAt: null,
      usage: null,
    });
    expect("password" in session.input).toBe(false);
  });
});

describe("Perception — State, Affordance, Transition", () => {
  it("round-trip", () => {
    const affordance: Affordance = roundTrips(Affordance, {
      id: "af_abcdefgh12",
      stateId: "st_abcdefgh12",
      ref: "e1",
      role: "button",
      accessibleName: "Buy",
      kind: "button",
      enabled: true,
      bbox: null,
      destructive: false,
      observedNotExercised: false,
      notExercisedReason: null,
    });
    expect(affordance.kind).toBe("button");

    roundTrips(State, {
      id: "st_abcdefgh12",
      sessionId: "ses_abcdefgh12",
      signature: "0123456789abcdef",
      url: "https://shop.test/",
      title: "Home",
      authRequired: false,
      snapshotEvidenceId: "ev_abcdefgh12",
      affordanceIds: ["af_abcdefgh12"],
      visitedVariants: 1,
      discoveredAt: ISO,
    });

    roundTrips(Transition, {
      id: "tr_abcdefgh12",
      sessionId: "ses_abcdefgh12",
      fromStateId: "st_abcdefgh12",
      toStateId: "st_abcdefgh13",
      viaAffordanceId: "af_abcdefgh12",
      action: "click",
      observedAt: ISO,
    });
  });
});

describe("Capability and the map", () => {
  it("round-trip", () => {
    const capability: Capability = roundTrips(Capability, {
      id: "cap_abcdefgh12",
      sessionId: "ses_abcdefgh12",
      name: "Checkout",
      description: "The purchase flow end to end.",
      entryStateId: "st_abcdefgh12",
      stateIds: ["st_abcdefgh12"],
      exitConditions: ["order confirmation shown"],
      dependsOn: [],
      risk: { score: 0.8, factors: riskFactors },
      priorityRank: 0,
    });

    roundTrips(CapabilityMap, {
      sessionId: "ses_abcdefgh12",
      authenticated: true,
      states: [],
      transitions: [],
      capabilities: [capability],
      apiHints: [],
      frontier: { discovered: 1, explored: 1, haltReason: "EXHAUSTED" },
    });
  });
});

describe("TestPlan, Scenario, TestStep", () => {
  it("round-trip", () => {
    const step: TestStep = roundTrips(TestStep, {
      id: "s1",
      order: 0,
      kind: "navigate",
      targetIntent: "go to the home page",
      stateId: "st_abcdefgh12",
      affordanceRef: null,
      locator: null,
      input: null,
      timeoutMs: 5000,
      optional: false,
      fingerprintId: null,
      resolvedCount: null,
    });

    const scenario: Scenario = roundTrips(Scenario, {
      id: "SC-001",
      planId: "pln_abcdefgh12",
      title: "Visit the home page",
      class: "happy",
      priority: "P1",
      priorityReason: "the entry point of the whole app",
      preconditions: [],
      steps: [step],
      expectedOutcome: "the home page renders",
      source: "agent",
      sourceRefs: [],
      plannedNotGenerated: false,
      notGeneratedReason: null,
      version: 1,
    });

    roundTrips(TestPlan, {
      id: "pln_abcdefgh12",
      lapId: "lap_abcdefgh12",
      capabilityId: "cap_abcdefgh12",
      round: 0,
      scenarios: [scenario],
      markdownPath: "plans/checkout.md",
      createdAt: ISO,
    });
  });
});

describe("CoverageAssessment", () => {
  it("round-trip", () => {
    const gap: Gap = roundTrips(Gap, {
      id: "gap_abcdefgh12",
      class: "MISSING_FLOW",
      title: "No negative-path scenario",
      why: "the plan only covers the happy path",
      severity: "MAJOR",
      suggestedScenario: "attempt checkout with an expired card",
      affordanceRefs: [],
    });

    roundTrips(CoverageAssessment, {
      id: "cva_abcdefgh12",
      lapId: "lap_abcdefgh12",
      planId: "pln_abcdefgh12",
      round: 0,
      score: 0.4519,
      floor: 0.7,
      structural: {
        affordancesExercised: 9,
        affordancesTotal: 21,
        transitionsTraversed: 5,
        transitionsTotal: 12,
        statesReached: 3,
        statesTotal: 4,
        classesPresent: ["happy"],
      },
      gaps: [gap],
      residualGaps: [],
      prdGaps: [],
      verdict: "REPLAN",
      source: "deterministic",
      createdAt: ISO,
    });
  });
});

describe("Lap — where the counters live", () => {
  it("round-trip", () => {
    roundTrips(Lap, {
      id: "lap_abcdefgh12",
      sessionId: "ses_abcdefgh12",
      capabilityId: "cap_abcdefgh12",
      index: 0,
      status: "LAP_PENDING",
      outcome: null,
      replanRounds: 0,
      healAttempts: {},
      acceptedRisk: [],
      specPath: null,
      startedAt: ISO,
      bankedAt: null,
    });
  });
});

describe("Run, events and evidence", () => {
  it("round-trip", () => {
    roundTrips(Run, {
      id: "run_abcdefgh12",
      lapId: "lap_abcdefgh12",
      scenarioId: "SC-001",
      status: "QUEUED",
      attempt: 0,
      startedAt: ISO,
      finishedAt: null,
      durationMs: null,
      verification: { healedStepRerun: false, fullFlowRerun: false },
      diagnosisSource: null,
    });

    roundTrips(SessionEvent, {
      seq: 0,
      sessionId: "ses_abcdefgh12",
      lapId: null,
      at: ISO,
      actor: "orchestrator",
      type: "session.started",
      payload: {},
    });

    roundTrips(Evidence, {
      id: "ev_abcdefgh12",
      sessionId: "ses_abcdefgh12",
      lapId: null,
      runId: null,
      stepId: null,
      type: "SNAPSHOT",
      path: "evidence/ab/cdef0123.json",
      sha256: "a".repeat(64),
      bytes: 128,
      capturedAt: ISO,
      label: "accessibility snapshot",
      metadata: {},
    });
  });
});

describe("Diagnosis, candidates, patches, fingerprints", () => {
  it("round-trip", () => {
    roundTrips(Diagnosis, {
      id: "dg_abcdefgh12",
      runId: "run_abcdefgh12",
      stepId: "s4",
      kind: "LOCATOR_BREAK",
      confidence: 0.96,
      evidenceIds: ["ev_abcdefgh12", "ev_abcdefgh13", "ev_abcdefgh14"],
      explanation: "the same role and name exist elsewhere in the snapshot",
      recommendedAction: "HEAL",
      source: "llm",
      vetoes: [],
      final: false,
      defectReport: null,
      sameRootCauseAs: null,
      failureSignature: "0123456789abcdef",
    });

    roundTrips(HealCandidate, {
      id: "hc_abcdefgh12",
      diagnosisId: "dg_abcdefgh12",
      rank: 1,
      strategy: "role_name",
      locator: "getByRole('button', { name: 'Place order' })",
      resolvedCount: 1,
      signals: {
        semantic: 1,
        role: 1,
        text: 1,
        domContext: 0.95,
        visualGeometry: 0.98,
        historical: 0,
      },
      score: 0.891,
      rationale: "same accessible role and name, adjacent DOM position",
      blockedBy: [],
    });

    roundTrips(TestPatch, {
      id: "pt_abcdefgh12",
      runId: "run_abcdefgh12",
      scenarioId: "SC-001",
      stepId: "s4",
      before: "locator('#place-order')",
      after: "getByRole('button', { name: 'Place order' })",
      diff: "--- a\n+++ b\n",
      beforeFileSha256: "a".repeat(64),
      appliedAt: ISO,
      verifiedAt: null,
      revertedAt: null,
    });

    roundTrips(ElementFingerprint, {
      id: "fp_abcdefgh12",
      scenarioId: "SC-001",
      stepId: "s4",
      capturedInRunId: "run_abcdefgh12",
      capturedAt: ISO,
      intent: "click the place-order button",
      role: "button",
      accessibleName: "Place order",
      text: "Place order",
      tagName: "button",
      testId: null,
      attributes: {},
      ancestorPath: [],
      siblingIndex: 0,
      bbox,
      viewport,
      screenshotCropEvidenceId: null,
      computedStyle: {
        color: "#000000",
        backgroundColor: "#ffffff",
        fontSize: "14px",
        fontWeight: "400",
        display: "block",
        visibility: "visible",
      },
    });
  });
});

describe("QualityReport and RobustnessScore", () => {
  it("round-trip", () => {
    const score: RobustnessScore = roundTrips(RobustnessScore, {
      current: 80,
      projected: 90,
      components: { coverage: 80 },
      perCapability: [
        { capabilityId: "cap_abcdefgh12", name: "Checkout", points: 80, lostBecause: [] },
      ],
      findings: [],
    });

    const flowRisk: UntestedFlowRisk = roundTrips(UntestedFlowRisk, {
      capabilityId: "cap_abcdefgh13",
      name: "Admin",
      why: "never reached within the state budget",
      riskScore: 0.4,
      factors: riskFactors,
    });

    roundTrips(QualityReport, {
      id: "qr_abcdefgh12",
      sessionId: "ses_abcdefgh12",
      scenariosCovered: [
        {
          scenarioId: "SC-001",
          capability: "Checkout",
          title: "Visit home",
          class: "happy",
          priority: "P1",
        },
      ],
      outcomes: { passed: 1, failed: 0, healed: 0, flaky: 0, skipped: 0 },
      healerActions: [],
      coverageGapsRemaining: [],
      untestedFlowRisk: [flowRisk],
      defects: [],
      score,
      hoursSaved: null,
      generatedAt: ISO,
    });
  });
});
