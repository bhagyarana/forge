// packages/orchestrator/src/terminal.test.ts — I-15: a session ends in exactly one
// terminal status; every lap ends BANKED with exactly one outcome. Also covers the
// "illegal-transition test throws" line from TASKLIST.md Ph1.3's verify step.
import { describe, expect, it } from "vitest";
import {
  assertSessionTransition,
  IllegalTransitionError,
  isTerminalSessionStatus,
  TERMINAL_SESSION_STATUSES,
} from "./session-machine.js";
import {
  assertLapTransition,
  IllegalLapTransitionError,
  isTerminalLapStatus,
} from "./lap-machine.js";

describe("I-15 — exactly one terminal session status", () => {
  it("the four terminal statuses have no outgoing transition", () => {
    for (const status of TERMINAL_SESSION_STATUSES) {
      expect(isTerminalSessionStatus(status)).toBe(true);
    }
  });

  it("no non-terminal status is mistaken for terminal", () => {
    for (const status of [
      "CREATED",
      "EXPLORING",
      "PRIORITISING",
      "LAPPING",
      "REPORTING",
    ] as const) {
      expect(isTerminalSessionStatus(status)).toBe(false);
    }
  });

  it("throws on an illegal session transition", () => {
    expect(() => assertSessionTransition("CREATED", "LAPPING")).toThrow(IllegalTransitionError);
    expect(() => assertSessionTransition("COMPLETED", "EXPLORING")).toThrow(IllegalTransitionError);
  });

  it("allows every legal transition in the session machine", () => {
    expect(() => assertSessionTransition("CREATED", "EXPLORING")).not.toThrow();
    expect(() => assertSessionTransition("EXPLORING", "PRIORITISING")).not.toThrow();
    expect(() => assertSessionTransition("PRIORITISING", "LAPPING")).not.toThrow();
    expect(() => assertSessionTransition("LAPPING", "REPORTING")).not.toThrow();
    expect(() => assertSessionTransition("REPORTING", "COMPLETED")).not.toThrow();
    expect(() => assertSessionTransition("REPORTING", "COMPLETED_PARTIAL")).not.toThrow();
    expect(() => assertSessionTransition("REPORTING", "ESCALATED")).not.toThrow();
  });
});

describe("every lap ends BANKED with exactly one outcome", () => {
  it("BANKED is the only terminal lap status", () => {
    expect(isTerminalLapStatus("BANKED")).toBe(true);
    for (const status of [
      "LAP_PENDING",
      "PLANNING",
      "CRITIQUING",
      "GENERATING",
      "RUNNING",
      "TRIAGING",
      "DECIDING",
      "HEALING",
      "VERIFYING",
    ] as const) {
      expect(isTerminalLapStatus(status)).toBe(false);
    }
  });

  it("throws on an illegal lap transition", () => {
    expect(() => assertLapTransition("LAP_PENDING", "RUNNING")).toThrow(IllegalLapTransitionError);
    expect(() => assertLapTransition("BANKED", "PLANNING")).toThrow(IllegalLapTransitionError);
  });
});
