// packages/core/schema/plan.ts — 05 §2.5: TestPlan, Scenario, TestStep
import { z } from "zod";
import { Id, Iso, Priority } from "./primitives.js";
import { ScenarioId, TestStepId } from "./id.js";

export const StepKind = z.enum([
  "navigate",
  "click",
  "fill",
  "select",
  "press",
  "hover",
  "waitFor",
  "assertText",
  "assertVisible",
  "assertUrl",
  "assertCount",
]);
export type StepKind = z.infer<typeof StepKind>;

/** Truth claims. Steps of these kinds are NEVER healed. See FR-705, veto V1. */
export const ASSERTION_KINDS = ["assertText", "assertVisible", "assertUrl", "assertCount"] as const;

export const TestStep = z.object({
  id: TestStepId, // scenario-local: s1, s2, …
  order: z.number().int().nonnegative(),
  kind: StepKind,
  /** Human-language purpose. Survives every refactor. The anchor for healing. */
  targetIntent: z.string().min(3).max(160),
  /** FR-204 — grounding. Both must resolve in the CapabilityMap or validation fails. */
  stateId: Id,
  affordanceRef: z.string().nullable(), // null only for `navigate`
  locator: z.string().nullable(), // written by the compiler, not the model
  input: z.string().nullable(),
  timeoutMs: z.number().int().default(5000),
  optional: z.boolean().default(false),
  fingerprintId: Id.nullable().default(null),
  /** Set at generation time by the live probe. Must be 1 to be emitted. FR-402 */
  resolvedCount: z.number().int().nullable().default(null),
});
export type TestStep = z.infer<typeof TestStep>;

export const ScenarioClass = z.enum(["happy", "negative", "boundary", "error_state"]);
export type ScenarioClass = z.infer<typeof ScenarioClass>;

export const Scenario = z.object({
  id: ScenarioId, // stable across re-planning — FR-205
  planId: Id,
  title: z.string().min(5),
  class: ScenarioClass, // FR-203
  priority: Priority,
  priorityReason: z.string().max(120), // FR-206
  preconditions: z.array(z.string()).default([]),
  steps: z.array(TestStep).min(1),
  expectedOutcome: z.string().min(5),
  source: z.enum(["agent", "prd", "intent", "critic_gap", "human"]).default("agent"),
  sourceRefs: z.array(z.string()).default([]), // PRD section ids — FR-207
  /** Planned but deliberately not generated — destructive on a non-disposable target. */
  plannedNotGenerated: z.boolean().default(false),
  notGeneratedReason: z.string().nullable().default(null), // FR-209
  version: z.number().int().positive().default(1), // bumps on an accepted patch
});
export type Scenario = z.infer<typeof Scenario>;

export const TestPlan = z.object({
  id: Id,
  lapId: Id,
  capabilityId: Id,
  round: z.number().int().min(0).max(2), // 0 = first attempt — FR-305
  scenarios: z.array(Scenario).min(1),
  markdownPath: z.string(), // FR-202 — the human artefact
  createdAt: Iso,
});
export type TestPlan = z.infer<typeof TestPlan>;
