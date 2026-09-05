// packages/evals/src/case-loader.ts — 16 §6: the case file format.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type GoldenCase = {
  id: string;
  title: string;
  seed: number;
  target: string;
  given: {
    reset: boolean;
    session: {
      url: string;
      intent?: string;
      budget?: { maxCapabilities?: number; maxDurationMs?: number; maxUsd?: number };
    };
    mutations?: Array<{ id: string; params?: Record<string, unknown> }>;
    fixtures?: { transcripts?: string; tape?: string };
  };
  expect: {
    session: { status: string; exitCode: number; defectsFound: number };
    backlog?: string[];
    laps?: Array<{ capability: string; replanRounds?: number; outcome?: string | null }>;
  };
  liveOnly?: string[];
  budgets?: Record<string, number>;
  requirements?: string[];
};

export function goldenDir(fixturesRoot: string): string {
  return join(fixturesRoot, "golden");
}

export function listCaseIds(fixturesRoot: string): string[] {
  const dir = goldenDir(fixturesRoot);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

export function loadCase(fixturesRoot: string, caseId: string): GoldenCase {
  const path = join(goldenDir(fixturesRoot), `${caseId}.json`);
  if (!existsSync(path)) throw new Error(`no such golden case: ${caseId} (${path})`);
  return JSON.parse(readFileSync(path, "utf8")) as GoldenCase;
}
