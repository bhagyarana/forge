// packages/evals/src/runner.test.ts — Ph1.6's own verify line: the harness runs end
// to end against a stub case, through the real API, over the real HTTP surface.
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runCase } from "./runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(__dirname, "..", "..", "..", "fixtures");

describe("runCase — STUB-01, replay tier", () => {
  it("drives the stub pipeline through the real API and matches the golden verdict", async () => {
    const result = await runCase(fixturesRoot, "STUB-01", "replay");
    expect(result.mismatches).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.verdict.session).toEqual({ status: "COMPLETED", exitCode: 0, defectsFound: 0 });
    expect(result.verdict.backlog).toEqual(["Checkout"]);
    expect(result.verdict.laps).toEqual([
      { capability: "Checkout", replanRounds: 0, outcome: "VERIFIED" },
    ]);
  });

  it("is independent across runs — each gets its own fresh db (case independence, 16 §6)", async () => {
    const first = await runCase(fixturesRoot, "STUB-01", "replay");
    const second = await runCase(fixturesRoot, "STUB-01", "replay");
    expect(first.verdict).toEqual(second.verdict);
  });
});

describe("runCase — a missing case fails loudly", () => {
  it("throws rather than silently producing an empty verdict", async () => {
    await expect(runCase(fixturesRoot, "NO-SUCH-CASE", "replay")).rejects.toThrow();
  });
});
