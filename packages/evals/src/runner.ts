// packages/evals/src/runner.ts — 16 §7: running the harness. Drives a case through
// the REAL orchestrator, via the REAL API (createApiServer, in-process) — what the
// eval suite proves is what ships.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seededRunContext, type Capability, type Lap, type Session } from "@forge/core";
import { createApiServer } from "@forge/api";
import { loadCase } from "./case-loader.js";
import { diffVerdict, type Verdict } from "./verdict.js";

const TERMINAL_STATUSES = new Set(["COMPLETED", "COMPLETED_PARTIAL", "ESCALATED", "ERROR"]);
const POLL_ATTEMPTS = 300;
const POLL_INTERVAL_MS = 10;

export type CaseResult = {
  caseId: string;
  passed: boolean;
  verdict: Verdict;
  mismatches: string[];
  durationMs: number;
};

export async function runCase(
  fixturesRoot: string,
  caseId: string,
  tier: "replay" | "live",
): Promise<CaseResult> {
  const goldenCase = loadCase(fixturesRoot, caseId);
  const startedAt = performance.now();
  const tmpDir = mkdtempSync(join(tmpdir(), `forge-eval-${caseId}-`));
  const dbPath = join(tmpDir, "forge.db");

  const app = createApiServer({
    dbPath,
    allowedHosts: [new URL(goldenCase.given.session.url).hostname],
    runContext: seededRunContext(goldenCase.seed, "2026-01-01T00:00:00.000Z"),
  });

  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: {
        url: goldenCase.given.session.url,
        intent: goldenCase.given.session.intent,
        budget: goldenCase.given.session.budget,
      },
    });
    if (created.statusCode !== 201) {
      throw new Error(
        `${caseId}: session creation failed (${created.statusCode}): ${created.payload}`,
      );
    }
    const sessionId = (created.json() as Session).id;

    let session = created.json() as Session;
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      const res = await app.inject({ method: "GET", url: `/api/sessions/${sessionId}` });
      session = res.json() as Session;
      if (TERMINAL_STATUSES.has(session.status)) break;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    if (!TERMINAL_STATUSES.has(session.status)) {
      throw new Error(
        `${caseId}: session never reached a terminal state (stuck at ${session.status})`,
      );
    }

    const capabilitiesRes = await app.inject({
      method: "GET",
      url: `/api/sessions/${sessionId}/capabilities`,
    });
    const capabilities = (capabilitiesRes.json() as { capabilities: Capability[] }).capabilities;

    const lapsRes = await app.inject({ method: "GET", url: `/api/sessions/${sessionId}/laps` });
    const laps = (lapsRes.json() as { laps: Lap[] }).laps;

    const capabilityName = (id: string): string =>
      capabilities.find((c) => c.id === id)?.name ?? id;

    const verdict: Verdict = {
      session: {
        status: session.status,
        exitCode: session.exitCode ?? -1,
        defectsFound: session.defectsFound,
      },
      backlog: capabilities.map((c) => c.name),
      laps: laps.map((l) => ({
        capability: capabilityName(l.capabilityId),
        replanRounds: l.replanRounds,
        outcome: l.outcome,
      })),
    };

    const mismatches =
      tier === "live"
        ? filterLiveOnly(diffVerdict(verdict, goldenCase), goldenCase.liveOnly)
        : diffVerdict(verdict, goldenCase);

    return {
      caseId,
      passed: mismatches.length === 0,
      verdict,
      mismatches,
      durationMs: performance.now() - startedAt,
    };
  } finally {
    await app.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function filterLiveOnly(mismatches: string[], liveOnly: string[] | undefined): string[] {
  if (!liveOnly || liveOnly.length === 0) return mismatches;
  return mismatches.filter((m) => !liveOnly.some((field) => m.startsWith(field)));
}

export async function runCases(
  fixturesRoot: string,
  caseIds: string[],
  tier: "replay" | "live",
): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  for (const caseId of caseIds) {
    results.push(await runCase(fixturesRoot, caseId, tier));
  }
  return results;
}
