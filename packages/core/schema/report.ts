// packages/core/schema/report.ts — 05 §2.10: QualityReport and RobustnessScore
import { z } from "zod";
import { Confidence, Id, Iso, Priority } from "./primitives.js";
import { RiskFactors } from "./capability.js";
import { Gap } from "./critique.js";
import { ScenarioClass } from "./plan.js";

export const UntestedFlowRisk = z.object({
  capabilityId: Id,
  name: z.string(),
  why: z.string().max(300),
  riskScore: Confidence,
  factors: RiskFactors, // FR-804 — ranked, never alphabetical
});
export type UntestedFlowRisk = z.infer<typeof UntestedFlowRisk>;

export const QualityReport = z.object({
  id: Id,
  sessionId: Id,
  // ── the five contents clause M7 names, all required ──────────────────
  scenariosCovered: z.array(
    z.object({
      scenarioId: z.string(),
      capability: z.string(),
      title: z.string(),
      class: ScenarioClass,
      priority: Priority,
    }),
  ),
  outcomes: z.object({
    passed: z.number().int(),
    failed: z.number().int(),
    healed: z.number().int(),
    flaky: z.number().int(),
    skipped: z.number().int(),
  }),
  healerActions: z.array(
    z.object({
      runId: Id,
      stepId: z.string(),
      decision: z.enum(["HEALED", "BLOCKED", "ESCALATED"]),
      vetoId: z.string().nullable(),
      before: z.string(),
      after: z.string().nullable(),
      confidence: Confidence,
      verified: z.boolean(),
    }),
  ),
  coverageGapsRemaining: z.array(Gap),
  untestedFlowRisk: z.array(UntestedFlowRisk),
  // ── everything below is ours, not the brief's ────────────────────────
  defects: z.array(
    z.object({
      diagnosisId: Id,
      capability: z.string(),
      expected: z.string(),
      actual: z.string(),
      severity: z.enum(["INFO", "MINOR", "MAJOR", "BLOCKER"]),
    }),
  ),
  score: z.lazy(() => RobustnessScore),
  hoursSaved: z // FR-807
    .object({
      estimate: z.number(),
      assumptions: z.array(z.string()).min(1),
    })
    .nullable(),
  generatedAt: Iso,
});
export type QualityReport = z.infer<typeof QualityReport>;

export const RobustnessScore = z.object({
  current: z.number().min(0).max(100), // FR-802
  projected: z.number().min(0).max(100), // FR-803 — "fix these and it scores 71"
  components: z.record(z.string(), z.number()), // every term, so it can be re-added by hand
  perCapability: z.array(
    z.object({
      // FR-806
      capabilityId: Id,
      name: z.string(),
      points: z.number(),
      lostBecause: z.array(z.string()),
    }),
  ),
  findings: z.array(
    z.object({
      findingId: Id,
      title: z.string(),
      pointsIfFixed: z.number(),
    }),
  ),
});
export type RobustnessScore = z.infer<typeof RobustnessScore>;
