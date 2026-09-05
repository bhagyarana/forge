// packages/orchestrator/src/guards.ts — 04 §3.3: the orchestrator's intelligence.
// Every guard is enumerated, typed and unit-tested; not one of them is a prompt
// instruction. `TG-n` ids below match the transition table exactly.
import type {
  Affordance,
  Capability,
  CapabilityMap,
  CoverageAssessment,
  DiagnosisKind,
  Gap,
  IdGen,
  Run,
  RunStatus,
  Scenario,
  TestPlan,
} from "@forge/core";
import { groundPlan, rank } from "@forge/core";
import {
  COVERAGE_FLOOR,
  MAX_HEAL_ATTEMPTS_PER_LAP,
  MAX_HEAL_ATTEMPTS_PER_STEP,
  MAX_REPLAN_ROUNDS,
} from "./constants.js";

export type GuardResult = { ok: true } | { ok: false; reason: string };

// ── TG-1 · CREATED → EXPLORING ─────────────────────────────────────────────
// URL parses, scheme is http(s), host passes the allowlist. FR-001, FR-002.
export function canStartExploring(url: string, allowedHosts: readonly string[]): GuardResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "url does not parse" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: `scheme '${parsed.protocol}' is not http(s)` };
  }
  if (!allowedHosts.includes(parsed.hostname)) {
    return { ok: false, reason: `host '${parsed.hostname}' is not in FORGE_ALLOWED_HOSTS` };
  }
  return { ok: true };
}

// ── TG-2 · EXPLORING → PRIORITISING ────────────────────────────────────────
// Zero capabilities degrades to one synthetic capability — never ERROR. FR-103, FR-105.
export function ensureCapabilities(map: CapabilityMap, idGen: IdGen): CapabilityMap {
  if (map.capabilities.length > 0) return map;

  const entryState = map.states[0];
  const synthetic: Capability = {
    id: idGen.next("cap"),
    sessionId: map.sessionId,
    name: "Entry point",
    description: "A synthetic capability covering the entry state — no others were discovered.",
    entryStateId: entryState?.id ?? "",
    stateIds: entryState ? [entryState.id] : [],
    exitConditions: ["the entry state renders"],
    dependsOn: [],
    risk: {
      score: 0.1,
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
  };
  return { ...map, capabilities: [synthetic] };
}

export function everyStateSigned(map: CapabilityMap): boolean {
  return map.states.every((s) => s.signature.length === 16);
}

// ── TG-3 · PRIORITISING → LAPPING ──────────────────────────────────────────
// The backlog is non-empty, and ranking is deterministic given the map. FR-902.
// The six-factor risk ranking itself — cluster(), computeRiskFactors(), rank() — is
// `packages/core/src/prioritise.ts` (Ph2.5, I-17); this is just that function wired
// into the FSM's guard surface.
export function rankCapabilities(
  capabilities: readonly Capability[],
  intent?: string,
): Capability[] {
  return rank(capabilities, intent);
}

export function canStartLapping(backlog: readonly Capability[]): boolean {
  return backlog.length > 0;
}

// ── TG-4 · LAP_PENDING → PLANNING ──────────────────────────────────────────
// Every capability in dependsOn[] is already BANKED. ADR-012 A1.
export function canStartPlanning(
  dependsOn: readonly string[],
  bankedCapabilityIds: ReadonlySet<string>,
): boolean {
  return dependsOn.every((id) => bankedCapabilityIds.has(id));
}

// ── TG-5a · PLANNING → CRITIQUING ───────────────────────────────────────────
// The plan is schema-valid and every step cites an observed stateId + affordanceRef.
// An ungrounded step fails validation — that is how a model invents a button. FR-204.
export function canCritique(
  plan: TestPlan,
  map: CapabilityMap,
  affordances: readonly Affordance[],
): GuardResult {
  const violations = groundPlan(plan, map, affordances);
  if (violations.length === 0) return { ok: true };
  return {
    ok: false,
    reason: `${violations.length} ungrounded step(s): ${violations
      .map((v) => `${v.scenarioId}/${v.stepId} (${v.reason})`)
      .join(", ")}`,
  };
}

// ── TG-5b · CRITIQUING → GENERATING | PLANNING ─────────────────────────────
// The brief's M4. Verbatim from 04 §3.3.
export type CritiqueTransition =
  | { next: "GENERATING"; residualGaps: Gap[]; acceptedRisk?: undefined }
  | { next: "PLANNING"; carry: Gap[]; replanRounds: number }
  | { next: "GENERATING"; acceptedRisk: Gap[]; residualGaps?: undefined };

export function afterCritique(
  lap: { replanRounds: number },
  a: CoverageAssessment,
): CritiqueTransition {
  const blocked = a.gaps.some((g) => g.severity === "BLOCKER");
  if (!blocked && a.score >= COVERAGE_FLOOR) {
    return { next: "GENERATING", residualGaps: a.residualGaps };
  }
  if (lap.replanRounds < MAX_REPLAN_ROUNDS) {
    return { next: "PLANNING", carry: a.gaps, replanRounds: lap.replanRounds + 1 };
  }
  return { next: "GENERATING", acceptedRisk: a.gaps }; // proceed, and say so
}

// ── TG-6 · CRITIQUING → PLANNING (re-plan) ─────────────────────────────────
// replanRounds < 2 AND (a blocker exists or the score is under the floor). FR-304.
export function canReplan(lap: { replanRounds: number }, a: CoverageAssessment): boolean {
  const blocked = a.gaps.some((g) => g.severity === "BLOCKER");
  const underFloor = a.score < COVERAGE_FLOOR;
  return lap.replanRounds < MAX_REPLAN_ROUNDS && (blocked || underFloor);
}

// ── TG-7 · GENERATING → RUNNING ─────────────────────────────────────────────
// Every emitted locator resolves to exactly one element live; a scenario that
// cannot is dropped with a stated reason — never emitted red. FR-402, FR-403.
export type LiveValidationResult = {
  emitted: Scenario[];
  dropped: Array<{ scenarioId: string; reason: string }>;
};

export function resolveLiveValidation(scenarios: readonly Scenario[]): LiveValidationResult {
  const emitted: Scenario[] = [];
  const dropped: Array<{ scenarioId: string; reason: string }> = [];
  for (const scenario of scenarios) {
    const unresolved = scenario.steps.find((s) => s.kind !== "navigate" && s.resolvedCount !== 1);
    if (unresolved) {
      dropped.push({
        scenarioId: scenario.id,
        reason: `step ${unresolved.id} resolved to ${unresolved.resolvedCount ?? "null"} element(s), not exactly 1`,
      });
    } else {
      emitted.push(scenario);
    }
  }
  return { emitted, dropped };
}

// ── TG-8 · RUNNING → BANKING ────────────────────────────────────────────────
// Every scenario reached a terminal verdict, including FLAKY. FR-509.
const TERMINAL_RUN_STATUSES: readonly RunStatus[] = [
  "VERIFIED",
  "FAIL_WITH_EVIDENCE",
  "ESCALATED",
  "FLAKY",
  "ERROR",
];

export function allTerminal(runs: readonly Run[]): boolean {
  return runs.every((r) => TERMINAL_RUN_STATUSES.includes(r.status));
}

// ── TG-9 · DECIDING → HEALING ────────────────────────────────────────────────
// kind === LOCATOR_BREAK AND no veto fired AND per-step attempts < 2 AND
// per-capability attempts < 3. FR-703, FR-704, FR-708.
export function canAutoHeal(
  diagnosis: { kind: DiagnosisKind; vetoes: readonly string[] },
  stepAttempts: number,
  lapAttempts: number,
): boolean {
  return (
    diagnosis.kind === "LOCATOR_BREAK" &&
    diagnosis.vetoes.length === 0 &&
    stepAttempts < MAX_HEAL_ATTEMPTS_PER_STEP &&
    lapAttempts < MAX_HEAL_ATTEMPTS_PER_LAP
  );
}

// ── TG-10 · VERIFYING → BANKED(VERIFIED) ────────────────────────────────────
// Anything less than both reruns rolls back byte-for-byte and escalates. FR-707, FR-710.
export function verificationPasses(v: {
  healedStepRerun: boolean;
  fullFlowRerun: boolean;
}): boolean {
  return v.healedStepRerun && v.fullFlowRerun;
}

// ── TG-11 · LAPPING → REPORTING ──────────────────────────────────────────────
// Backlog empty, or a budget is exhausted. Budget exhaustion is COMPLETED_PARTIAL,
// never ERROR. FR-008, FR-904.
export type LappingTransition = { next: "REPORTING"; partial: boolean };

export function afterLapping(
  backlogRemaining: number,
  budgetExhausted: boolean,
): LappingTransition | null {
  if (backlogRemaining === 0) return { next: "REPORTING", partial: false };
  if (budgetExhausted) return { next: "REPORTING", partial: true };
  return null; // more capabilities to lap, budget intact — stay in LAPPING
}

// ── Terminal status → exit code — 04 §3.4, resolved at W-5 (00 §7) ─────────
export type SessionTerminal = "COMPLETED" | "COMPLETED_PARTIAL" | "ESCALATED" | "ERROR";

export function exitCodeFor(terminal: SessionTerminal, defectsFound: number): 0 | 1 | 2 | 3 {
  switch (terminal) {
    case "COMPLETED":
    case "COMPLETED_PARTIAL":
      return defectsFound > 0 ? 1 : 0;
    case "ESCALATED":
      return 2;
    case "ERROR":
      return 3;
  }
}
