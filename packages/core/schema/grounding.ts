// packages/core/schema/grounding.ts — I-13: every TestStep.stateId and affordanceRef
// resolves in the CapabilityMap. Pure — no model, no I/O — so TG-5a can enforce it as
// a compile-time-cheap check rather than a prompt instruction (06 §4.2).
//
// `CapabilityMap` records which Affordance *ids* belong to each State, but does not
// embed the Affordance objects themselves (05 §2.4) — those live in the store. Callers
// pass the affordances observed for the session alongside the map.
import type { Affordance } from "./perception.js";
import type { CapabilityMap } from "./capability.js";
import type { TestPlan } from "./plan.js";

export type GroundingViolation = {
  scenarioId: string;
  stepId: string;
  reason: "STATE_NOT_FOUND" | "AFFORDANCE_NOT_FOUND";
};

export function groundPlan(
  plan: TestPlan,
  map: CapabilityMap,
  affordances: readonly Affordance[],
): GroundingViolation[] {
  const stateIds = new Set(map.states.map((s) => s.id));
  const affordancesByState = new Map<string, Set<string>>();
  for (const affordance of affordances) {
    const forState = affordancesByState.get(affordance.stateId) ?? new Set<string>();
    forState.add(affordance.id);
    affordancesByState.set(affordance.stateId, forState);
  }

  const violations: GroundingViolation[] = [];
  for (const scenario of plan.scenarios) {
    for (const step of scenario.steps) {
      if (!stateIds.has(step.stateId)) {
        violations.push({ scenarioId: scenario.id, stepId: step.id, reason: "STATE_NOT_FOUND" });
        continue;
      }
      if (step.affordanceRef === null) continue; // null only for `navigate` — 05 §2.5
      const forState = affordancesByState.get(step.stateId);
      if (!forState?.has(step.affordanceRef)) {
        violations.push({
          scenarioId: scenario.id,
          stepId: step.id,
          reason: "AFFORDANCE_NOT_FOUND",
        });
      }
    }
  }
  return violations;
}

export function isGrounded(
  plan: TestPlan,
  map: CapabilityMap,
  affordances: readonly Affordance[],
): boolean {
  return groundPlan(plan, map, affordances).length === 0;
}
