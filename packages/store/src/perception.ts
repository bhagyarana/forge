// packages/store/src/perception.ts — states, affordances, transitions (05 §4).
import type { Affordance, State, Transition } from "@forge/core";
import type { Db } from "./db.js";

type StateRow = {
  id: string;
  session_id: string;
  signature: string;
  url: string;
  title: string;
  auth_required: number;
  snapshot_evidence_id: string;
  affordance_ids_json?: string;
  visited_variants: number;
  discovered_at: string;
};

export function putState(db: Db, state: State): State {
  db.prepare(
    `INSERT INTO states (id, session_id, signature, url, title, auth_required, snapshot_evidence_id, visited_variants, discovered_at)
     VALUES (@id, @sessionId, @signature, @url, @title, @authRequired, @snapshotEvidenceId, @visitedVariants, @discoveredAt)`,
  ).run({
    id: state.id,
    sessionId: state.sessionId,
    signature: state.signature,
    url: state.url,
    title: state.title,
    authRequired: state.authRequired ? 1 : 0,
    snapshotEvidenceId: state.snapshotEvidenceId,
    visitedVariants: state.visitedVariants,
    discoveredAt: state.discoveredAt,
  });
  return state;
}

export function listStates(
  db: Db,
  sessionId: string,
  affordanceIdsByState: Map<string, string[]>,
): State[] {
  const rows = db.prepare("SELECT * FROM states WHERE session_id = ?").all(sessionId) as StateRow[];
  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    signature: row.signature,
    url: row.url,
    title: row.title,
    authRequired: Boolean(row.auth_required),
    snapshotEvidenceId: row.snapshot_evidence_id,
    affordanceIds: affordanceIdsByState.get(row.id) ?? [],
    visitedVariants: row.visited_variants,
    discoveredAt: row.discovered_at,
  }));
}

type AffordanceRow = {
  id: string;
  state_id: string;
  ref: string;
  role: string;
  accessible_name: string | null;
  kind: Affordance["kind"];
  enabled: number;
  destructive: number;
  observed_not_exercised: number;
  not_exercised_reason: string | null;
  bbox_json: string | null;
};

export function putAffordance(db: Db, affordance: Affordance): Affordance {
  db.prepare(
    `INSERT INTO affordances (id, state_id, ref, role, accessible_name, kind, enabled, destructive, observed_not_exercised, not_exercised_reason, bbox_json)
     VALUES (@id, @stateId, @ref, @role, @accessibleName, @kind, @enabled, @destructive, @observedNotExercised, @notExercisedReason, @bboxJson)`,
  ).run({
    id: affordance.id,
    stateId: affordance.stateId,
    ref: affordance.ref,
    role: affordance.role,
    accessibleName: affordance.accessibleName,
    kind: affordance.kind,
    enabled: affordance.enabled ? 1 : 0,
    destructive: affordance.destructive ? 1 : 0,
    observedNotExercised: affordance.observedNotExercised ? 1 : 0,
    notExercisedReason: affordance.notExercisedReason,
    bboxJson: affordance.bbox ? JSON.stringify(affordance.bbox) : null,
  });
  return affordance;
}

function rowToAffordance(row: AffordanceRow): Affordance {
  return {
    id: row.id,
    stateId: row.state_id,
    ref: row.ref,
    role: row.role,
    accessibleName: row.accessible_name,
    kind: row.kind,
    enabled: Boolean(row.enabled),
    bbox: row.bbox_json ? JSON.parse(row.bbox_json) : null,
    destructive: Boolean(row.destructive),
    observedNotExercised: Boolean(row.observed_not_exercised),
    notExercisedReason: row.not_exercised_reason,
  };
}

export function listAffordancesForSession(db: Db, sessionId: string): Affordance[] {
  const rows = db
    .prepare(
      `SELECT a.* FROM affordances a JOIN states s ON s.id = a.state_id WHERE s.session_id = ?`,
    )
    .all(sessionId) as AffordanceRow[];
  return rows.map(rowToAffordance);
}

export function listAffordancesForState(db: Db, stateId: string): Affordance[] {
  const rows = db
    .prepare("SELECT * FROM affordances WHERE state_id = ?")
    .all(stateId) as AffordanceRow[];
  return rows.map(rowToAffordance);
}

export function putTransition(db: Db, transition: Transition): Transition {
  db.prepare(
    `INSERT INTO transitions (id, session_id, from_state_id, to_state_id, via_affordance_id, action, observed_at)
     VALUES (@id, @sessionId, @fromStateId, @toStateId, @viaAffordanceId, @action, @observedAt)`,
  ).run({
    id: transition.id,
    sessionId: transition.sessionId,
    fromStateId: transition.fromStateId,
    toStateId: transition.toStateId,
    viaAffordanceId: transition.viaAffordanceId,
    action: transition.action,
    observedAt: transition.observedAt,
  });
  return transition;
}

export function listTransitions(db: Db, sessionId: string): Transition[] {
  const rows = db
    .prepare("SELECT * FROM transitions WHERE session_id = ?")
    .all(sessionId) as Array<{
    id: string;
    session_id: string;
    from_state_id: string;
    to_state_id: string;
    via_affordance_id: string;
    action: Transition["action"];
    observed_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    fromStateId: row.from_state_id,
    toStateId: row.to_state_id,
    viaAffordanceId: row.via_affordance_id,
    action: row.action,
    observedAt: row.observed_at,
  }));
}

/** Reconstructs the full `states[].affordanceIds` shape from the two tables. */
export function loadStatesWithAffordanceIds(db: Db, sessionId: string): State[] {
  const affordances = listAffordancesForSession(db, sessionId);
  const byState = new Map<string, string[]>();
  for (const a of affordances) {
    const forState = byState.get(a.stateId) ?? [];
    forState.push(a.id);
    byState.set(a.stateId, forState);
  }
  return listStates(db, sessionId, byState);
}
