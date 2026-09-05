// packages/core/schema/critique.ts — 05 §2.6: CoverageAssessment
import { z } from "zod";
import { Confidence, Id, Iso, Severity } from "./primitives.js";
import { ScenarioClass } from "./plan.js";

export const GapClass = z.enum([
  "MISSING_FLOW",
  "MISSING_EDGE_CASE",
  "MISSING_ERROR_STATE", // the brief's three — FR-302
]);
export type GapClass = z.infer<typeof GapClass>;

export const Gap = z.object({
  id: Id,
  class: GapClass,
  title: z.string().max(120),
  why: z.string().max(400),
  severity: Severity, // BLOCKER blocks the transition — TG-5b
  suggestedScenario: z.string().max(400),
  affordanceRefs: z.array(z.string()).default([]), // what evidence says it exists
});
export type Gap = z.infer<typeof Gap>;

export const CoverageAssessment = z.object({
  id: Id,
  lapId: Id,
  planId: Id,
  round: z.number().int().min(0).max(2),
  /** [0,1], reproducible from stored inputs. Algorithm in 11 §3. FR-303 */
  score: Confidence,
  floor: Confidence, // the threshold in force for this run
  structural: z.object({
    // the deterministic half — no model
    affordancesExercised: z.number().int(),
    affordancesTotal: z.number().int(),
    transitionsTraversed: z.number().int(),
    transitionsTotal: z.number().int(),
    statesReached: z.number().int(),
    statesTotal: z.number().int(),
    classesPresent: z.array(ScenarioClass),
  }),
  gaps: z.array(Gap), // FR-302
  residualGaps: z.array(Gap).default([]), // FR-306 — present even on a pass
  prdGaps: z // FR-307 — the brief's Bonus B1
    .array(
      z.object({
        requirement: z.string(),
        prdSectionRef: z.string(),
        severity: Severity,
      }),
    )
    .default([]),
  verdict: z.enum(["PASS", "REPLAN", "ACCEPT_RISK"]),
  source: z.enum(["deterministic", "llm", "llm+deterministic"]), // FR-308
  createdAt: Iso,
});
export type CoverageAssessment = z.infer<typeof CoverageAssessment>;
