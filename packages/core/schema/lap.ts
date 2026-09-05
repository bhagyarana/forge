// packages/core/schema/lap.ts — 05 §2.7: Lap, where the counters live
import { z } from "zod";
import { Id, Iso } from "./primitives.js";
import { Gap } from "./critique.js";

export const LapStatus = z.enum([
  "LAP_PENDING",
  "PLANNING",
  "CRITIQUING",
  "GENERATING",
  "RUNNING",
  "TRIAGING",
  "DECIDING",
  "HEALING",
  "VERIFYING",
  "BANKED",
]);
export type LapStatus = z.infer<typeof LapStatus>;

export const LapOutcome = z.enum([
  "VERIFIED",
  "DEFECT_FOUND",
  "ESCALATED",
  "PARTIAL",
  "LAP_FAILED",
]);
export type LapOutcome = z.infer<typeof LapOutcome>;

export const Lap = z.object({
  id: Id,
  sessionId: Id,
  capabilityId: Id,
  index: z.number().int().nonnegative(), // backlog position, 0-based
  status: LapStatus,
  outcome: LapOutcome.nullable(),
  replanRounds: z.number().int().min(0).max(2), // FR-305 · I-12
  healAttempts: z.record(z.string(), z.number().int()), // stepId → attempts · FR-708
  acceptedRisk: z.array(Gap).default([]),
  specPath: z.string().nullable(), // the banked file — FR-405
  startedAt: Iso,
  bankedAt: Iso.nullable(),
});
export type Lap = z.infer<typeof Lap>;
