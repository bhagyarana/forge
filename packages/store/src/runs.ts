// packages/store/src/runs.ts — the runs table (05 §4). One row per scenario attempt.
import type { Run, RunStatus } from "@forge/core";
import type { Db } from "./db.js";

type RunRow = {
  id: string;
  lap_id: string;
  scenario_id: string;
  status: RunStatus;
  attempt: number;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  diagnosis_source: Run["diagnosisSource"];
  verification_json: string;
};

function rowToRun(row: RunRow): Run {
  return {
    id: row.id,
    lapId: row.lap_id,
    scenarioId: row.scenario_id,
    status: row.status,
    attempt: row.attempt,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    verification: JSON.parse(row.verification_json) as Run["verification"],
    diagnosisSource: row.diagnosis_source,
  };
}

export function putRun(db: Db, run: Run): Run {
  db.prepare(
    `INSERT INTO runs (id, lap_id, scenario_id, status, attempt, started_at, finished_at, duration_ms, diagnosis_source, verification_json)
     VALUES (@id, @lapId, @scenarioId, @status, @attempt, @startedAt, @finishedAt, @durationMs, @diagnosisSource, @verificationJson)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       finished_at = excluded.finished_at,
       duration_ms = excluded.duration_ms,
       diagnosis_source = excluded.diagnosis_source,
       verification_json = excluded.verification_json`,
  ).run({
    id: run.id,
    lapId: run.lapId,
    scenarioId: run.scenarioId,
    status: run.status,
    attempt: run.attempt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    durationMs: run.durationMs,
    diagnosisSource: run.diagnosisSource,
    verificationJson: JSON.stringify(run.verification),
  });
  return run;
}

export function getRun(db: Db, runId: string): Run | null {
  const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(runId) as RunRow | undefined;
  return row ? rowToRun(row) : null;
}

export function listRunsForLap(db: Db, lapId: string): Run[] {
  const rows = db
    .prepare("SELECT * FROM runs WHERE lap_id = ? ORDER BY started_at ASC")
    .all(lapId) as RunRow[];
  return rows.map(rowToRun);
}
