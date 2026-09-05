// packages/orchestrator/src/constants.ts — thresholds enforced by the guards (04 §3.3).
// 15 §4.2: constants are SCREAMING_SNAKE, exported from one file per package.

/** TG-5b: the score a CoverageAssessment must clear, with zero BLOCKER gaps. */
export const COVERAGE_FLOOR = 0.7;

/** TG-6, I-12: a lap may be sent back to PLANNING at most this many times. */
export const MAX_REPLAN_ROUNDS = 2;

/** TG-9, I-4: heal attempts are capped per step and per lap. */
export const MAX_HEAL_ATTEMPTS_PER_STEP = 2;
export const MAX_HEAL_ATTEMPTS_PER_LAP = 3;
