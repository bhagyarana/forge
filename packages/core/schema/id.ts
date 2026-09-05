// packages/core/schema/id.ts — 05 §6: ID conventions
import { z } from "zod";
import type { IdGen } from "../src/env.js";
import { Id } from "./primitives.js";

export const ID_PREFIXES = {
  session: "ses",
  state: "st",
  affordance: "af",
  transition: "tr",
  capability: "cap",
  lap: "lap",
  testPlan: "pln",
  coverageAssessment: "cva",
  gap: "gap",
  run: "run",
  evidence: "ev",
  fingerprint: "fp",
  diagnosis: "dg",
  healCandidate: "hc",
  testPatch: "pt",
  qualityReport: "qr",
} as const;

export type IdPrefix = (typeof ID_PREFIXES)[keyof typeof ID_PREFIXES];

/** Session-scoped, human-facing, stable across re-planning — 05 §2.5, FR-205. */
export const ScenarioId = z.string().regex(/^SC-\d{3,}$/);
export type ScenarioId = z.infer<typeof ScenarioId>;

/** Scenario-local — 05 §2.5. */
export const TestStepId = z.string().regex(/^s\d+$/);
export type TestStepId = z.infer<typeof TestStepId>;

/** A schema that additionally checks the id was minted with the expected prefix. */
export function idWithPrefix(prefix: IdPrefix) {
  return Id.refine((value) => value.startsWith(`${prefix}_`), {
    message: `expected an id prefixed '${prefix}_'`,
  });
}

export function makeId(prefix: IdPrefix, idGen: IdGen): string {
  return idGen.next(prefix);
}
