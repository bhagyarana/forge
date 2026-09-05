// packages/core/schema/diagnose.ts — 05 §2.9: Diagnosis, candidates, patches, fingerprints
import { z } from "zod";
import { BBox, Confidence, Id, Iso, Viewport } from "./primitives.js";

export const DiagnosisKind = z.enum([
  "LOCATOR_BREAK",
  "CONTENT_DRIFT", // was DESIGN_DRIFT — see 05 §5
  "PRODUCT_BUG",
  "FLAKY",
  "ENVIRONMENT",
  "UNKNOWN",
]);
export type DiagnosisKind = z.infer<typeof DiagnosisKind>;

export const RecommendedAction = z.enum(["HEAL", "FAIL", "ESCALATE", "RETRY"]);
export type RecommendedAction = z.infer<typeof RecommendedAction>;

export const Diagnosis = z.object({
  id: Id,
  runId: Id,
  stepId: z.string(),
  kind: DiagnosisKind,
  confidence: Confidence,
  evidenceIds: z.array(Id).min(3), // FR-602 — must cite ≥ 3
  explanation: z.string().min(10).max(400),
  recommendedAction: RecommendedAction,
  source: z.enum(["deterministic", "llm", "llm+deterministic"]),
  vetoes: z.array(z.string()).default([]), // ["V2"]
  final: z.boolean().default(false), // true ⇒ no model output may override
  /** Non-null for PRODUCT_BUG. All three fields required. FR-606 */
  defectReport: z
    .object({
      expected: z.string(),
      actual: z.string(),
      reproduction: z.array(z.string()).min(1),
    })
    .nullable()
    .default(null),
  /** Set when this failure matched a previously diagnosed signature — no model call. */
  sameRootCauseAs: z.string().nullable().default(null),
  failureSignature: z.string().length(16),
});
export type Diagnosis = z.infer<typeof Diagnosis>;

export const HealSignals = z.object({
  semantic: Confidence,
  role: Confidence,
  text: Confidence,
  domContext: Confidence,
  visualGeometry: Confidence,
  historical: Confidence,
});
export type HealSignals = z.infer<typeof HealSignals>;

export const HealCandidate = z.object({
  id: Id,
  diagnosisId: Id,
  rank: z.number().int(),
  strategy: z.enum([
    "role_name",
    "label",
    "placeholder",
    "text",
    "test_id",
    "alt_title",
    "dom_relative",
    "css",
    "xpath",
    "geometry",
  ]),
  locator: z.string(),
  resolvedCount: z.number().int(), // must be exactly 1 to be eligible
  signals: HealSignals,
  score: Confidence,
  rationale: z.string().max(300),
  blockedBy: z.array(z.string()).default([]), // veto IDs
});
export type HealCandidate = z.infer<typeof HealCandidate>;

export const TestPatch = z.object({
  id: Id,
  runId: Id,
  scenarioId: z.string(),
  stepId: z.string(),
  before: z.string(),
  after: z.string(),
  diff: z.string(), // unified diff — FR-709
  beforeFileSha256: z.string().length(64), // enables byte-exact rollback — FR-710
  appliedAt: Iso,
  verifiedAt: Iso.nullable(),
  revertedAt: Iso.nullable(),
});
export type TestPatch = z.infer<typeof TestPatch>;

export const ElementFingerprint = z.object({
  id: Id,
  scenarioId: z.string(),
  stepId: z.string(),
  capturedInRunId: Id,
  capturedAt: Iso,
  intent: z.string(),
  role: z.string().nullable(),
  accessibleName: z.string().nullable(),
  text: z.string().nullable(),
  tagName: z.string(),
  testId: z.string().nullable(),
  attributes: z.record(z.string()), // allowlist, see 05 §2.9
  ancestorPath: z.array(
    z.object({
      tag: z.string(),
      role: z.string().nullable(),
      id: z.string().nullable(),
    }),
  ), // root → parent, max 6 deep
  siblingIndex: z.number().int(),
  bbox: BBox,
  viewport: Viewport,
  screenshotCropEvidenceId: Id.nullable(),
  computedStyle: z.object({
    color: z.string(),
    backgroundColor: z.string(),
    fontSize: z.string(),
    fontWeight: z.string(),
    display: z.string(),
    visibility: z.string(),
  }),
});
export type ElementFingerprint = z.infer<typeof ElementFingerprint>;

/**
 * Attribute allowlist — 05 §2.9. Everything else is discarded at capture time,
 * because framework hydration attributes change on every build and would make
 * every fingerprint look stale.
 */
export const FINGERPRINT_ATTRIBUTE_ALLOWLIST = [
  "type",
  "name",
  "placeholder",
  "aria-label",
  "aria-labelledby",
  "title",
  "alt",
  "href",
  "value",
  "role",
  "data-testid",
  "data-test",
  "data-qa",
] as const;
