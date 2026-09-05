// packages/store/src/laps.ts — the Lap row: where replanRounds and healAttempts live
// (05 §2.7). replan_rounds carries a `CHECK (replan_rounds <= 2)` — I-12.
import type { Clock, IdGen, Lap, LapOutcome, LapStatus } from "@forge/core";
import type { Db } from "./db.js";

type LapRow = {
  id: string;
  session_id: string;
  capability_id: string;
  idx: number;
  status: LapStatus;
  outcome: LapOutcome | null;
  replan_rounds: number;
  heal_attempts_json: string;
  accepted_risk_json: string;
  spec_path: string | null;
  started_at: string;
  banked_at: string | null;
};

function rowToLap(row: LapRow): Lap {
  return {
    id: row.id,
    sessionId: row.session_id,
    capabilityId: row.capability_id,
    index: row.idx,
    status: row.status,
    outcome: row.outcome,
    replanRounds: row.replan_rounds,
    healAttempts: JSON.parse(row.heal_attempts_json) as Record<string, number>,
    acceptedRisk: JSON.parse(row.accepted_risk_json),
    specPath: row.spec_path,
    startedAt: row.started_at,
    bankedAt: row.banked_at,
  };
}

export function openLap(
  db: Db,
  ctx: { clock: Clock; idGen: IdGen },
  input: { sessionId: string; capabilityId: string; index: number },
): Lap {
  const id = ctx.idGen.next("lap");
  const startedAt = ctx.clock.now().toISOString();
  db.prepare(
    `INSERT INTO laps (id, session_id, capability_id, idx, status, outcome, replan_rounds, heal_attempts_json, accepted_risk_json, spec_path, started_at, banked_at)
     VALUES (@id, @sessionId, @capabilityId, @idx, 'LAP_PENDING', NULL, 0, '{}', '[]', NULL, @startedAt, NULL)`,
  ).run({
    id,
    sessionId: input.sessionId,
    capabilityId: input.capabilityId,
    idx: input.index,
    startedAt,
  });
  return getLap(db, id) as Lap;
}

export function getLap(db: Db, lapId: string): Lap | null {
  const row = db.prepare("SELECT * FROM laps WHERE id = ?").get(lapId) as LapRow | undefined;
  return row ? rowToLap(row) : null;
}

export function listLaps(db: Db, sessionId: string): Lap[] {
  const rows = db
    .prepare("SELECT * FROM laps WHERE session_id = ? ORDER BY idx ASC")
    .all(sessionId) as LapRow[];
  return rows.map(rowToLap);
}

export function updateLapStatus(db: Db, lapId: string, status: LapStatus): void {
  db.prepare("UPDATE laps SET status = ? WHERE id = ?").run(status, lapId);
}

export function setLapSpecPath(db: Db, lapId: string, specPath: string): void {
  db.prepare("UPDATE laps SET spec_path = ? WHERE id = ?").run(specPath, lapId);
}

/**
 * Enforced twice, on purpose (I-12): the FSM guard (`canReplan`) refuses the
 * transition before this is ever called, and the DDL's `CHECK` constraint is the
 * backstop if a caller ever forgets. A round already at 2 throws here.
 */
export function incrementReplanRounds(db: Db, lapId: string): Lap {
  db.prepare("UPDATE laps SET replan_rounds = replan_rounds + 1 WHERE id = ?").run(lapId);
  return getLap(db, lapId) as Lap;
}

export function recordHealAttempt(db: Db, lapId: string, stepId: string): Lap {
  const lap = getLap(db, lapId);
  if (!lap) throw new Error(`no such lap: ${lapId}`);
  const healAttempts = { ...lap.healAttempts, [stepId]: (lap.healAttempts[stepId] ?? 0) + 1 };
  db.prepare("UPDATE laps SET heal_attempts_json = ? WHERE id = ?").run(
    JSON.stringify(healAttempts),
    lapId,
  );
  return getLap(db, lapId) as Lap;
}

export function bankLap(db: Db, ctx: { clock: Clock }, lapId: string, outcome: LapOutcome): Lap {
  const bankedAt = ctx.clock.now().toISOString();
  db.prepare("UPDATE laps SET status = 'BANKED', outcome = ?, banked_at = ? WHERE id = ?").run(
    outcome,
    bankedAt,
    lapId,
  );
  return getLap(db, lapId) as Lap;
}
