// packages/orchestrator/src/verify.test.ts — I-7: Run.status = VERIFIED requires
// verification.fullFlowRerun = true. Enforced by TG-10.
import { describe, expect, it } from "vitest";
import { verificationPasses } from "./guards.js";
import { assertLapTransition, IllegalLapTransitionError } from "./lap-machine.js";

describe("I-7 / TG-10 — VERIFIED requires the full flow to have re-run clean", () => {
  it("both reruns true passes verification", () => {
    expect(verificationPasses({ healedStepRerun: true, fullFlowRerun: true })).toBe(true);
  });

  it("the healed step alone is not enough — the whole scenario must reprove itself", () => {
    expect(verificationPasses({ healedStepRerun: true, fullFlowRerun: false })).toBe(false);
  });

  it("neither having run is obviously not verified", () => {
    expect(verificationPasses({ healedStepRerun: false, fullFlowRerun: false })).toBe(false);
  });

  it("a lap may only reach BANKED from VERIFYING (or RUNNING/DECIDING) — never skip verification", () => {
    expect(() => assertLapTransition("HEALING", "BANKED")).toThrow(IllegalLapTransitionError);
    expect(() => assertLapTransition("VERIFYING", "BANKED")).not.toThrow();
  });
});
