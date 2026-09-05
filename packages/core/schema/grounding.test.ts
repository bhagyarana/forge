// packages/core/schema/grounding.test.ts — I-13: every TestStep.stateId and
// affordanceRef resolves in the CapabilityMap, or validation fails.
import { describe, expect, it } from "vitest";
import { groundPlan, isGrounded } from "./grounding.js";
import type { CapabilityMap } from "./capability.js";
import type { Affordance } from "./perception.js";
import type { TestPlan } from "./plan.js";

const ISO = "2026-01-01T00:00:00.000Z";

function map(): CapabilityMap {
  return {
    sessionId: "ses_abcdefgh12",
    authenticated: true,
    states: [
      {
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
      },
    ],
    transitions: [],
    capabilities: [],
    apiHints: [],
    frontier: { discovered: 1, explored: 1, haltReason: "EXHAUSTED" },
  };
}

function affordances(): Affordance[] {
  return [
    {
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
    },
  ];
}

function planCitingStateAndAffordance(stateId: string, affordanceRef: string | null): TestPlan {
  return {
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
        title: "Buy the thing",
        class: "happy",
        priority: "P1",
        priorityReason: "core flow",
        preconditions: [],
        expectedOutcome: "the order is placed",
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
            stateId,
            affordanceRef,
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
}

describe("groundPlan — I-13", () => {
  it("a step that cites an observed state and affordance is grounded", () => {
    const plan = planCitingStateAndAffordance("st_abcdefgh12", "af_abcdefgh12");
    expect(groundPlan(plan, map(), affordances())).toEqual([]);
    expect(isGrounded(plan, map(), affordances())).toBe(true);
  });

  it("navigate steps are grounded with a null affordanceRef", () => {
    const plan = planCitingStateAndAffordance("st_abcdefgh12", null);
    expect(isGrounded(plan, map(), affordances())).toBe(true);
  });

  it("a step citing an unobserved state fails validation", () => {
    const plan = planCitingStateAndAffordance("st_unseen000", "af_abcdefgh12");
    const violations = groundPlan(plan, map(), affordances());
    expect(violations).toEqual([{ scenarioId: "SC-001", stepId: "s1", reason: "STATE_NOT_FOUND" }]);
    expect(isGrounded(plan, map(), affordances())).toBe(false);
  });

  it("a step citing an unobserved affordance fails validation — the model invented a button", () => {
    const plan = planCitingStateAndAffordance("st_abcdefgh12", "af_unseen0000");
    const violations = groundPlan(plan, map(), affordances());
    expect(violations).toEqual([
      { scenarioId: "SC-001", stepId: "s1", reason: "AFFORDANCE_NOT_FOUND" },
    ]);
  });
});
