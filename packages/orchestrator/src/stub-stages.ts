// packages/orchestrator/src/stub-stages.ts — Ph1-ONLY canned stage outputs.
//
// Ph1's goal is "a stubbed session runs start to finish, through the real FSM,
// persisted, streamed, and replayable — with every stage a stub" (TASKLIST.md Ph1).
// The functions below stand in for the real Explorer/Planner/Critic/Generator/Runner,
// which are built in later phases. Each is replaced call-site-by-call-site, never all
// at once:
//   stubExplore()   → Ph2, packages/agents/explorer + packages/perception
//   stubPlan()      → Ph3, packages/agents/planner
//   stubCritique()  → Ph3, packages/core/critic (structuralScore) + packages/agents/critic
//   stubGenerate()  → Ph4, packages/core/compile
//   stubRun()       → Ph4, packages/runner
//
// Every output here is already schema-valid and grounded, so the real FSM, guards and
// store persist it exactly as they would a real one — nothing downstream can tell the
// difference between a stub artefact and a real one shaped like it.
import type {
  Affordance,
  CapabilityMap,
  Clock,
  CoverageAssessment,
  IdGen,
  Run,
  State,
  TestPlan,
} from "@forge/core";
import { COVERAGE_FLOOR } from "./constants.js";

export type RunCtx = { clock: Clock; idGen: IdGen };

export function stubExplore(
  sessionId: string,
  url: string,
  ctx: RunCtx,
): { map: CapabilityMap; affordances: Affordance[] } {
  const stateId = ctx.idGen.next("st");
  const affordanceId = ctx.idGen.next("af");
  const capabilityId = ctx.idGen.next("cap");
  const evidenceId = ctx.idGen.next("ev");
  const discoveredAt = ctx.clock.now().toISOString();

  const state: State = {
    id: stateId,
    sessionId,
    signature: "0000000000000001",
    url,
    title: "Home",
    authRequired: false,
    snapshotEvidenceId: evidenceId,
    affordanceIds: [affordanceId],
    visitedVariants: 1,
    discoveredAt,
  };

  const affordance: Affordance = {
    id: affordanceId,
    stateId,
    ref: "e1",
    role: "link",
    accessibleName: "Checkout",
    kind: "link",
    enabled: true,
    bbox: null,
    destructive: false,
    observedNotExercised: false,
    notExercisedReason: null,
  };

  const map: CapabilityMap = {
    sessionId,
    authenticated: false,
    states: [state],
    transitions: [],
    capabilities: [
      {
        id: capabilityId,
        sessionId,
        name: "Checkout",
        description: "The stubbed capability that drives the Ph1 spine end to end.",
        entryStateId: stateId,
        stateIds: [stateId],
        exitConditions: ["the entry state renders"],
        dependsOn: [],
        risk: {
          score: 0.9,
          factors: {
            authProximity: 0,
            dataMutation: 0,
            moneyOrPii: 0,
            graphCentrality: 0,
            affordanceDensity: 0,
            statedIntent: 0,
          },
        },
        priorityRank: 0,
      },
    ],
    apiHints: [],
    frontier: { discovered: 1, explored: 1, haltReason: "EXHAUSTED" },
  };

  return { map, affordances: [affordance] };
}

export function stubPlan(
  lapId: string,
  capabilityId: string,
  map: CapabilityMap,
  round: number,
  ctx: RunCtx,
): TestPlan {
  const state = map.states[0];
  if (!state) throw new Error("stubPlan: capability map has no states");
  const planId = ctx.idGen.next("pln");

  return {
    id: planId,
    lapId,
    capabilityId,
    round,
    markdownPath: `plans/${capabilityId}.md`,
    createdAt: ctx.clock.now().toISOString(),
    scenarios: [
      {
        id: "SC-001",
        planId,
        title: "Visit the entry state",
        class: "happy",
        priority: "P1",
        priorityReason: "the only observed flow",
        preconditions: [],
        expectedOutcome: "the entry state renders",
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
            targetIntent: "go to the entry state",
            stateId: state.id,
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
}

export function stubCritique(plan: TestPlan, ctx: RunCtx): CoverageAssessment {
  return {
    id: ctx.idGen.next("cva"),
    lapId: plan.lapId,
    planId: plan.id,
    round: plan.round,
    score: 1,
    floor: COVERAGE_FLOOR,
    structural: {
      affordancesExercised: 1,
      affordancesTotal: 1,
      transitionsTraversed: 0,
      transitionsTotal: 0,
      statesReached: 1,
      statesTotal: 1,
      classesPresent: ["happy"],
    },
    gaps: [],
    residualGaps: [],
    prdGaps: [],
    verdict: "PASS",
    source: "deterministic",
    createdAt: ctx.clock.now().toISOString(),
  };
}

/** Sets `resolvedCount` as the live probe would — every locator here trivially resolves. */
export function stubGenerate(plan: TestPlan): TestPlan {
  return {
    ...plan,
    scenarios: plan.scenarios.map((scenario) => ({
      ...scenario,
      steps: scenario.steps.map((step) =>
        step.kind === "navigate" ? step : { ...step, resolvedCount: 1 },
      ),
    })),
  };
}

export function stubRun(lapId: string, plan: TestPlan, ctx: RunCtx): Run[] {
  return plan.scenarios.map((scenario) => ({
    id: ctx.idGen.next("run"),
    lapId,
    scenarioId: scenario.id,
    status: "VERIFIED",
    attempt: 0,
    startedAt: ctx.clock.now().toISOString(),
    finishedAt: ctx.clock.now().toISOString(),
    durationMs: 0,
    verification: { healedStepRerun: false, fullFlowRerun: false },
    diagnosisSource: null,
  }));
}
