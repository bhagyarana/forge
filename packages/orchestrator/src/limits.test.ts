// packages/orchestrator/src/limits.test.ts — I-4: healAttempts ≤ 2 per step and ≤ 3 per lap.
import { describe, expect, it } from "vitest";
import { canAutoHeal } from "./guards.js";
import { MAX_HEAL_ATTEMPTS_PER_LAP, MAX_HEAL_ATTEMPTS_PER_STEP } from "./constants.js";

function locatorBreak(vetoes: string[] = []) {
  return { kind: "LOCATOR_BREAK" as const, vetoes };
}

describe("I-4 — heal attempt caps", () => {
  it("permits attempts strictly under both caps", () => {
    for (let step = 0; step < MAX_HEAL_ATTEMPTS_PER_STEP; step++) {
      for (let lap = 0; lap < MAX_HEAL_ATTEMPTS_PER_LAP; lap++) {
        expect(canAutoHeal(locatorBreak(), step, lap)).toBe(true);
      }
    }
  });

  it("refuses at the per-step cap regardless of the per-lap count", () => {
    expect(canAutoHeal(locatorBreak(), MAX_HEAL_ATTEMPTS_PER_STEP, 0)).toBe(false);
  });

  it("refuses at the per-lap cap regardless of the per-step count", () => {
    expect(canAutoHeal(locatorBreak(), 0, MAX_HEAL_ATTEMPTS_PER_LAP)).toBe(false);
  });

  it("the caps are exactly 2 per step and 3 per lap — 05 §5, FR-708", () => {
    expect(MAX_HEAL_ATTEMPTS_PER_STEP).toBe(2);
    expect(MAX_HEAL_ATTEMPTS_PER_LAP).toBe(3);
  });
});
