// packages/store/src/plans.ts — test_plans: rounds are kept, not overwritten (I-11's
// partner table — the unique index is on (lap_id, round), never lap_id alone).
import type { TestPlan } from "@forge/core";
import type { Db } from "./db.js";

export function putTestPlan(db: Db, plan: TestPlan): TestPlan {
  db.prepare(
    `INSERT INTO test_plans (id, lap_id, capability_id, round, markdown_path, doc_json, created_at)
     VALUES (@id, @lapId, @capabilityId, @round, @markdownPath, @docJson, @createdAt)`,
  ).run({
    id: plan.id,
    lapId: plan.lapId,
    capabilityId: plan.capabilityId,
    round: plan.round,
    markdownPath: plan.markdownPath,
    docJson: JSON.stringify(plan),
    createdAt: plan.createdAt,
  });
  return plan;
}

export function getTestPlan(db: Db, lapId: string, round: number): TestPlan | null {
  const row = db
    .prepare("SELECT doc_json FROM test_plans WHERE lap_id = ? AND round = ?")
    .get(lapId, round) as { doc_json: string } | undefined;
  return row ? (JSON.parse(row.doc_json) as TestPlan) : null;
}

/** Every round ever produced for this lap, oldest first — round 0 is never overwritten. */
export function listTestPlans(db: Db, lapId: string): TestPlan[] {
  const rows = db
    .prepare("SELECT doc_json FROM test_plans WHERE lap_id = ? ORDER BY round ASC")
    .all(lapId) as { doc_json: string }[];
  return rows.map((r) => JSON.parse(r.doc_json) as TestPlan);
}
