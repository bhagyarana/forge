// packages/orchestrator/src/session-machine.ts — 04 §3.1: the session machine runs once.
import type { SessionStatus } from "@forge/core";

export class IllegalTransitionError extends Error {}

const SESSION_TRANSITIONS: Record<SessionStatus, readonly SessionStatus[]> = {
  CREATED: ["EXPLORING", "ERROR"],
  EXPLORING: ["PRIORITISING", "ERROR"],
  PRIORITISING: ["LAPPING", "ERROR"],
  LAPPING: ["REPORTING", "ERROR"],
  REPORTING: ["COMPLETED", "COMPLETED_PARTIAL", "ESCALATED", "ERROR"],
  COMPLETED: [],
  COMPLETED_PARTIAL: [],
  ESCALATED: [],
  ERROR: [],
};

/** I-15: a session ends in exactly one terminal status. */
export const TERMINAL_SESSION_STATUSES: readonly SessionStatus[] = [
  "COMPLETED",
  "COMPLETED_PARTIAL",
  "ESCALATED",
  "ERROR",
];

export function isTerminalSessionStatus(status: SessionStatus): boolean {
  return SESSION_TRANSITIONS[status].length === 0;
}

/** Throws IllegalTransitionError on any transition not in the table above. */
export function assertSessionTransition(from: SessionStatus, to: SessionStatus): void {
  if (!SESSION_TRANSITIONS[from].includes(to)) {
    throw new IllegalTransitionError(`illegal session transition: ${from} → ${to}`);
  }
}
