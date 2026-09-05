// packages/store/src/assessments.ts — coverage_assessments: exactly 1:1 with a plan
// (idx_assess_plan is UNIQUE on plan_id) — I-11: no lap enters GENERATING without one.
import type { CoverageAssessment } from "@forge/core";
import type { Db } from "./db.js";

export function putCoverageAssessment(db: Db, assessment: CoverageAssessment): CoverageAssessment {
  db.prepare(
    `INSERT INTO coverage_assessments (id, lap_id, plan_id, round, score, floor, verdict, source, doc_json, created_at)
     VALUES (@id, @lapId, @planId, @round, @score, @floor, @verdict, @source, @docJson, @createdAt)`,
  ).run({
    id: assessment.id,
    lapId: assessment.lapId,
    planId: assessment.planId,
    round: assessment.round,
    score: assessment.score,
    floor: assessment.floor,
    verdict: assessment.verdict,
    source: assessment.source,
    docJson: JSON.stringify(assessment),
    createdAt: assessment.createdAt,
  });
  return assessment;
}

export function getCoverageAssessmentForPlan(db: Db, planId: string): CoverageAssessment | null {
  const row = db
    .prepare("SELECT doc_json FROM coverage_assessments WHERE plan_id = ?")
    .get(planId) as { doc_json: string } | undefined;
  return row ? (JSON.parse(row.doc_json) as CoverageAssessment) : null;
}
