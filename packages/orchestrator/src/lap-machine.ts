// packages/orchestrator/src/lap-machine.ts — 04 §3.2: the lap machine runs once per
// capability and is the machine that does the work.
import type { LapStatus } from "@forge/core";

export class IllegalLapTransitionError extends Error {}

const LAP_TRANSITIONS: Record<LapStatus, readonly LapStatus[]> = {
  LAP_PENDING: ["PLANNING"],
  PLANNING: ["CRITIQUING"],
  CRITIQUING: ["GENERATING", "PLANNING"], // TG-5b / TG-6
  GENERATING: ["RUNNING"],
  RUNNING: ["BANKED", "TRIAGING"], // all green → BANKING; a failure → TRIAGING
  TRIAGING: ["DECIDING"],
  DECIDING: ["HEALING", "BANKED"], // BANKED covers DEFECT_FOUND and ESCALATED outcomes
  HEALING: ["VERIFYING"],
  VERIFYING: ["BANKED"], // TG-10 — a failed verification still banks, via rollback
  BANKED: [],
};

export function isTerminalLapStatus(status: LapStatus): boolean {
  return status === "BANKED";
}

export function assertLapTransition(from: LapStatus, to: LapStatus): void {
  if (!LAP_TRANSITIONS[from].includes(to)) {
    throw new IllegalLapTransitionError(`illegal lap transition: ${from} → ${to}`);
  }
}
