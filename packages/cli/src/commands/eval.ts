import { join } from "node:path";
import { listCaseIds, runCases } from "@forge/evals";

export type EvalOptions = {
  tier: "replay" | "live";
  caseId?: string | undefined;
  repeat: number;
  coverage: boolean;
};

/**
 * The golden-case harness (16 · Agent Test Suite). Drives each case through the real
 * orchestrator, via the real API, in-process (packages/evals/src/runner.ts). Exits 0
 * when every case's verdict matched its expectation — including a case whose own
 * session correctly exits 1 or 2 (15 §10.1). Only a harness error is a CI failure.
 */
export async function runEval(repoRoot: string, options: EvalOptions): Promise<number> {
  const fixturesRoot = join(repoRoot, "fixtures");
  const caseIds = options.caseId ? [options.caseId] : listCaseIds(fixturesRoot);

  if (options.caseId && caseIds.length === 0) {
    console.error(`forge eval: no such case '${options.caseId}' in ${fixturesRoot}/golden`);
    return 3;
  }

  console.log(
    `FORGE EVAL · ${caseIds.length} case(s) · ${options.tier} · repeat ${options.repeat}`,
  );

  let allPassed = true;
  let passedCount = 0;
  for (let round = 0; round < options.repeat; round++) {
    let results;
    try {
      results = await runCases(fixturesRoot, caseIds, options.tier);
    } catch (err) {
      console.error(`forge eval: harness error — ${(err as Error).message}`);
      return 3;
    }
    passedCount = results.filter((r) => r.passed).length;
    for (const result of results) {
      const badge = result.passed ? "✓" : "✗";
      console.log(
        `  ${result.caseId}  ${result.verdict.session.status}  ${badge}  (${result.durationMs.toFixed(0)}ms)`,
      );
      if (!result.passed) {
        allPassed = false;
        for (const mismatch of result.mismatches) console.log(`      ${mismatch}`);
      }
    }
  }

  console.log(`\n${passedCount}/${caseIds.length} · exit ${allPassed ? 0 : 1}`);
  return allPassed ? 0 : 1;
}
