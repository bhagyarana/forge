// packages/evals/src/verdict.test.ts — diffVerdict is what makes forge eval's exit
// code semantics honest: a MATCH is what counts, not whether the session's own exit
// code happened to be zero (15 §10.1, 16 §6). A case whose own session correctly
// exits 1 or 2 still passes the harness when its verdict matches the expectation.
import { describe, expect, it } from "vitest";
import { diffVerdict, type Verdict } from "./verdict.js";
import type { GoldenCase } from "./case-loader.js";

function baseCase(overrides: Partial<GoldenCase["expect"]> = {}): GoldenCase {
  return {
    id: "TEST-CASE",
    title: "test",
    seed: 1,
    target: "stub",
    given: { reset: true, session: { url: "http://localhost:4100/" } },
    expect: { session: { status: "COMPLETED", exitCode: 0, defectsFound: 0 }, ...overrides },
  };
}

describe("diffVerdict", () => {
  it("no mismatches when the verdict matches exactly", () => {
    const verdict: Verdict = {
      session: { status: "COMPLETED", exitCode: 0, defectsFound: 0 },
      backlog: [],
      laps: [],
    };
    expect(diffVerdict(verdict, baseCase())).toEqual([]);
  });

  it("a case whose own session exits 1 (a defect was found) still PASSES when the verdict matches", () => {
    const verdict: Verdict = {
      session: { status: "COMPLETED", exitCode: 1, defectsFound: 1 },
      backlog: [],
      laps: [],
    };
    const goldenCase = baseCase({ session: { status: "COMPLETED", exitCode: 1, defectsFound: 1 } });
    expect(diffVerdict(verdict, goldenCase)).toEqual([]);
  });

  it("a case whose own session exits 2 (escalated) still PASSES when the verdict matches", () => {
    const verdict: Verdict = {
      session: { status: "ESCALATED", exitCode: 2, defectsFound: 0 },
      backlog: [],
      laps: [],
    };
    const goldenCase = baseCase({ session: { status: "ESCALATED", exitCode: 2, defectsFound: 0 } });
    expect(diffVerdict(verdict, goldenCase)).toEqual([]);
  });

  it("reports every mismatched field, not just the first", () => {
    const verdict: Verdict = {
      session: { status: "ERROR", exitCode: 3, defectsFound: 5 },
      backlog: [],
      laps: [],
    };
    const mismatches = diffVerdict(verdict, baseCase());
    expect(mismatches).toHaveLength(3);
  });

  it("backlog order matters — I-17 is about a deterministic order, not just membership", () => {
    const verdict: Verdict = {
      session: { status: "COMPLETED", exitCode: 0, defectsFound: 0 },
      backlog: ["Sign-in", "Checkout"],
      laps: [],
    };
    const goldenCase = baseCase();
    goldenCase.expect.backlog = ["Checkout", "Sign-in"];
    expect(diffVerdict(verdict, goldenCase).some((m) => m.startsWith("backlog"))).toBe(true);
  });

  it("checks per-lap fields named in expect.laps", () => {
    const verdict: Verdict = {
      session: { status: "COMPLETED", exitCode: 0, defectsFound: 0 },
      backlog: ["Checkout"],
      laps: [{ capability: "Checkout", replanRounds: 1, outcome: "VERIFIED" }],
    };
    const goldenCase = baseCase();
    goldenCase.expect.laps = [{ capability: "Checkout", replanRounds: 0, outcome: "VERIFIED" }];
    const mismatches = diffVerdict(verdict, goldenCase);
    expect(mismatches.some((m) => m.includes("replanRounds"))).toBe(true);
  });
});
