// packages/store/src/capabilities.ts — the capabilities table (05 §4).
import type { Capability } from "@forge/core";
import type { Db } from "./db.js";

export function putCapability(db: Db, capability: Capability): Capability {
  db.prepare(
    `INSERT INTO capabilities (id, session_id, name, description, entry_state_id, risk_score, priority_rank, doc_json)
     VALUES (@id, @sessionId, @name, @description, @entryStateId, @riskScore, @priorityRank, @docJson)`,
  ).run({
    id: capability.id,
    sessionId: capability.sessionId,
    name: capability.name,
    description: capability.description,
    entryStateId: capability.entryStateId,
    riskScore: capability.risk.score,
    priorityRank: capability.priorityRank,
    docJson: JSON.stringify(capability),
  });
  return capability;
}

export function listCapabilities(db: Db, sessionId: string): Capability[] {
  const rows = db
    .prepare("SELECT doc_json FROM capabilities WHERE session_id = ? ORDER BY priority_rank ASC")
    .all(sessionId) as { doc_json: string }[];
  return rows.map((r) => JSON.parse(r.doc_json) as Capability);
}
