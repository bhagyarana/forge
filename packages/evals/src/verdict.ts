// packages/evals/src/verdict.ts — 16 §4.1: the verdict tuple. Ph1 only has the
// session/backlog/lap fields a stub pipeline can produce; the diagnosis/heal fields
// this type owns in the full spec are added as Ph3–Ph5 land the endpoints behind them.
import type { GoldenCase } from "./case-loader.js";

export type Verdict = {
  session: { status: string; exitCode: number; defectsFound: number };
  backlog: string[];
  laps: Array<{ capability: string; replanRounds: number; outcome: string | null }>;
};

export function diffVerdict(verdict: Verdict, goldenCase: GoldenCase): string[] {
  const mismatches: string[] = [];
  const expected = goldenCase.expect.session;

  if (verdict.session.status !== expected.status) {
    mismatches.push(`session.status: expected ${expected.status}, got ${verdict.session.status}`);
  }
  if (verdict.session.exitCode !== expected.exitCode) {
    mismatches.push(
      `session.exitCode: expected ${expected.exitCode}, got ${verdict.session.exitCode}`,
    );
  }
  if (verdict.session.defectsFound !== expected.defectsFound) {
    mismatches.push(
      `session.defectsFound: expected ${expected.defectsFound}, got ${verdict.session.defectsFound}`,
    );
  }

  if (goldenCase.expect.backlog) {
    const expectedBacklog = JSON.stringify(goldenCase.expect.backlog);
    const actualBacklog = JSON.stringify(verdict.backlog);
    if (expectedBacklog !== actualBacklog) {
      mismatches.push(`backlog: expected ${expectedBacklog}, got ${actualBacklog}`);
    }
  }

  if (goldenCase.expect.laps) {
    for (const expectedLap of goldenCase.expect.laps) {
      const actualLap = verdict.laps.find((l) => l.capability === expectedLap.capability);
      if (!actualLap) {
        mismatches.push(`laps: no lap found for capability '${expectedLap.capability}'`);
        continue;
      }
      if (
        expectedLap.replanRounds !== undefined &&
        actualLap.replanRounds !== expectedLap.replanRounds
      ) {
        mismatches.push(
          `laps[${expectedLap.capability}].replanRounds: expected ${expectedLap.replanRounds}, got ${actualLap.replanRounds}`,
        );
      }
      if (expectedLap.outcome !== undefined && actualLap.outcome !== expectedLap.outcome) {
        mismatches.push(
          `laps[${expectedLap.capability}].outcome: expected ${expectedLap.outcome}, got ${actualLap.outcome}`,
        );
      }
    }
  }

  return mismatches;
}
