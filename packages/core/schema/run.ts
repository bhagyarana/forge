// packages/core/schema/run.ts — 05 §2.8: Run, events and evidence
import { z } from "zod";
import { Id, Iso } from "./primitives.js";

export const RunStatus = z.enum([
  "QUEUED",
  "RUNNING",
  "VERIFIED",
  "FAIL_WITH_EVIDENCE",
  "ESCALATED",
  "FLAKY",
  "ERROR",
]);
export type RunStatus = z.infer<typeof RunStatus>;

export const StepStatus = z.enum(["PASSED", "FAILED", "SKIPPED", "HEALED", "FLAKY"]);
export type StepStatus = z.infer<typeof StepStatus>;

export const Run = z.object({
  id: Id,
  lapId: Id,
  scenarioId: z.string(),
  status: RunStatus,
  attempt: z.number().int().min(0), // 0 = initial, 1..2 = post-heal
  startedAt: Iso,
  finishedAt: Iso.nullable(),
  durationMs: z.number().int().nullable(),
  verification: z.object({
    healedStepRerun: z.boolean().default(false),
    fullFlowRerun: z.boolean().default(false), // TG-10 · I-7
  }),
  diagnosisSource: z.enum(["deterministic", "llm", "llm+deterministic"]).nullable(),
});
export type Run = z.infer<typeof Run>;

export const SessionEventType = z.enum([
  "session.started",
  "explore.state",
  "explore.finished",
  "capabilities.ranked",
  "lap.started",
  "plan.drafted",
  "critique.finished",
  "critique.replan",
  "generate.validated",
  "generate.dropped",
  "run.started",
  "step.finished",
  "evidence.captured",
  "triage.finished",
  "heal.candidates",
  "heal.decided",
  "heal.patched",
  "heal.rolled_back",
  "verify.finished",
  "lap.banked",
  "report.generated",
  "session.finished",
]);
export type SessionEventType = z.infer<typeof SessionEventType>;

export const SessionEvent = z.object({
  seq: z.number().int().nonnegative(), // monotonic, gapless, per session
  sessionId: Id,
  lapId: Id.nullable(),
  at: Iso,
  actor: z.enum([
    "orchestrator",
    "explorer",
    "planner",
    "critic",
    "generator",
    "runner",
    "triage",
    "healer",
    "reporter",
    "human",
  ]),
  type: SessionEventType,
  payload: z.record(z.unknown()),
});
export type SessionEvent = z.infer<typeof SessionEvent>;

export const EvidenceType = z.enum([
  "SNAPSHOT", // accessibility snapshot — the perception primitive
  "DOM",
  "SCREENSHOT",
  "CROP",
  "TRACE",
  "CONSOLE",
  "NETWORK",
  "DIFF",
  "PATCH",
  "TRANSCRIPT", // a sub-agent loop transcript — ADR-011 §4, cost 3
  "PLAN",
  "REPORT",
]);
export type EvidenceType = z.infer<typeof EvidenceType>;

export const Evidence = z.object({
  id: Id,
  sessionId: Id,
  lapId: Id.nullable(),
  runId: Id.nullable(),
  stepId: z.string().nullable(),
  type: EvidenceType,
  path: z.string(), // relative to artifacts/
  sha256: z.string().length(64),
  bytes: z.number().int().nonnegative(),
  capturedAt: Iso,
  label: z.string(), // short human caption for the UI
  metadata: z.record(z.unknown()).default({}),
});
export type Evidence = z.infer<typeof Evidence>;
