// packages/orchestrator/src/scheduler.ts — runSession(): persists before it emits,
// always (FR-903). Every stage between EXPLORING and BANKING is a Ph1 stub
// (stub-stages.ts); the FSM, the guards and the store around them are real.
import type { CapabilityMap, Clock, IdGen, Rng, Session, SessionInput } from "@forge/core";
import {
  appendEvent,
  bankLap,
  createSession,
  getSession,
  listAffordancesForSession,
  listCapabilities,
  listLaps,
  listTransitions,
  loadStatesWithAffordanceIds,
  openLap,
  putAffordance,
  putCapability,
  putCoverageAssessment,
  putRun,
  putState,
  putTestPlan,
  putTransition,
  updateLapStatus,
  updateSessionStatus,
  type Db,
} from "@forge/store";
import {
  afterCritique,
  afterLapping,
  allTerminal,
  canCritique,
  canStartLapping,
  canStartPlanning,
  ensureCapabilities,
  exitCodeFor,
  rankCapabilities,
  resolveLiveValidation,
} from "./guards.js";
import { assertLapTransition } from "./lap-machine.js";
import { assertSessionTransition, isTerminalSessionStatus } from "./session-machine.js";
import { stubCritique, stubExplore, stubGenerate, stubPlan, stubRun } from "./stub-stages.js";

export type SchedulerDeps = { db: Db; clock: Clock; rng: Rng; idGen: IdGen };

export type RunSessionOptions = {
  /**
   * Test-only seam for the restart-resume drill (FR-903, Ph1.7): return as soon as
   * this many laps have been banked, leaving the session in LAPPING rather than
   * finishing it — the way an OS process kill would, except everything already
   * persisted survives because it was written before it was emitted.
   */
  stopAfterLapsBanked?: number;
};

/**
 * Creates the session row and its `session.started` event, and returns immediately —
 * this is the whole of what `POST /sessions` needs before it responds `201` (FR-002).
 * The rest of the pipeline is driven by `resumeSession`, called without awaiting it.
 */
export function beginSession(input: Omit<SessionInput, "password">, deps: SchedulerDeps): Session {
  const session = createSession(deps.db, deps, input);
  appendEvent(deps.db, deps.clock, {
    sessionId: session.id,
    lapId: null,
    actor: "orchestrator",
    type: "session.started",
    payload: { url: input.url },
  });
  return session;
}

/** `beginSession` followed by driving it to a terminal state — for tests and the eval harness. */
export async function runSession(
  input: Omit<SessionInput, "password">,
  deps: SchedulerDeps,
  options: RunSessionOptions = {},
): Promise<Session> {
  const session = beginSession(input, deps);
  return continueSession(session.id, deps, options);
}

/** Resumes a session from exactly the state its last persisted transition left it in. */
export async function resumeSession(
  sessionId: string,
  deps: SchedulerDeps,
  options: RunSessionOptions = {},
): Promise<Session> {
  return continueSession(sessionId, deps, options);
}

function reconstructMap(db: Db, sessionId: string): CapabilityMap | null {
  const states = loadStatesWithAffordanceIds(db, sessionId);
  if (states.length === 0) return null;
  return {
    sessionId,
    authenticated: false, // real auth tracking lands in Ph2
    states,
    transitions: listTransitions(db, sessionId),
    capabilities: listCapabilities(db, sessionId),
    apiHints: [],
    frontier: { discovered: states.length, explored: states.length, haltReason: "EXHAUSTED" },
  };
}

async function continueSession(
  sessionId: string,
  deps: SchedulerDeps,
  options: RunSessionOptions,
): Promise<Session> {
  const { db, clock, idGen } = deps;
  let session = getSession(db, sessionId);
  if (!session) throw new Error(`no such session: ${sessionId}`);
  if (isTerminalSessionStatus(session.status)) return session;

  let map = reconstructMap(db, sessionId);

  if (!map) {
    // ── EXPLORING ──────────────────────────────────────────────────────────
    assertSessionTransition(session.status, "EXPLORING");
    session = updateSessionStatus(db, sessionId, "EXPLORING");

    const explored = stubExplore(sessionId, session.input.url, deps);
    map = ensureCapabilities(explored.map, idGen); // TG-2

    for (const state of map.states) putState(db, state);
    for (const affordance of explored.affordances) putAffordance(db, affordance);
    for (const transition of map.transitions) putTransition(db, transition);
    for (const capability of map.capabilities) putCapability(db, capability);

    appendEvent(db, clock, {
      sessionId,
      lapId: null,
      actor: "explorer",
      type: "explore.finished",
      payload: {
        states: map.states.length,
        capabilities: map.capabilities.length,
        haltReason: map.frontier.haltReason,
      },
    });

    // ── PRIORITISING ──────────────────────────────────────────────────────
    assertSessionTransition("EXPLORING", "PRIORITISING");
    session = updateSessionStatus(db, sessionId, "PRIORITISING");
    const backlogNames = rankCapabilities(map.capabilities, session.input.intent).map(
      (c) => c.name,
    ); // TG-3
    appendEvent(db, clock, {
      sessionId,
      lapId: null,
      actor: "orchestrator",
      type: "capabilities.ranked",
      payload: { backlog: backlogNames },
    });

    // ── LAPPING (enter) ───────────────────────────────────────────────────
    assertSessionTransition("PRIORITISING", "LAPPING");
    session = updateSessionStatus(db, sessionId, "LAPPING");
  }

  if (!canStartLapping(map.capabilities)) {
    // Unreachable: ensureCapabilities (TG-2) guarantees at least the synthetic one.
    throw new Error("TG-3 refused: empty backlog after ensureCapabilities");
  }

  const affordances = listAffordancesForSession(db, sessionId);
  const backlog = rankCapabilities(map.capabilities, session.input.intent);
  const existingLaps = listLaps(db, sessionId);
  const bankedCapabilityIds = new Set(
    existingLaps.filter((l) => l.status === "BANKED").map((l) => l.capabilityId),
  );
  const defectsFound = 0; // the Ph1 stub Runner never fails a scenario

  for (let index = 0; index < backlog.length; index++) {
    const capability = backlog[index];
    if (!capability) continue;
    if (bankedCapabilityIds.has(capability.id)) continue; // FR-903: never re-run a banked lap

    if (!canStartPlanning(capability.dependsOn, bankedCapabilityIds)) {
      throw new Error(`TG-4 refused: ${capability.id} has an unbanked dependency`);
    }

    const existingLap = existingLaps.find((l) => l.capabilityId === capability.id) ?? null;
    const lap = existingLap ?? openLap(db, deps, { sessionId, capabilityId: capability.id, index });
    if (!existingLap) {
      appendEvent(db, clock, {
        sessionId,
        lapId: lap.id,
        actor: "orchestrator",
        type: "lap.started",
        payload: { capability: capability.name },
      });
    }

    assertLapTransition("LAP_PENDING", "PLANNING");
    updateLapStatus(db, lap.id, "PLANNING");
    const plan = stubPlan(lap.id, capability.id, map, lap.replanRounds, deps);
    putTestPlan(db, plan);
    appendEvent(db, clock, {
      sessionId,
      lapId: lap.id,
      actor: "planner",
      type: "plan.drafted",
      payload: { planId: plan.id, round: plan.round },
    });

    assertLapTransition("PLANNING", "CRITIQUING");
    updateLapStatus(db, lap.id, "CRITIQUING");
    const grounding = canCritique(plan, map, affordances); // TG-5a
    if (!grounding.ok) throw new Error(`TG-5a refused: ${grounding.reason}`);

    const assessment = stubCritique(plan, deps);
    putCoverageAssessment(db, assessment);
    appendEvent(db, clock, {
      sessionId,
      lapId: lap.id,
      actor: "critic",
      type: "critique.finished",
      payload: { score: assessment.score, verdict: assessment.verdict },
    });

    const critiqueTransition = afterCritique({ replanRounds: lap.replanRounds }, assessment); // TG-5b
    if (critiqueTransition.next === "PLANNING") {
      // The Ph1 stub critique always clears the floor, so this branch is unreached
      // today. It is here so Ph3's real critic drops into this same loop unmodified.
      throw new Error("stub critique unexpectedly required a re-plan — see TG-6");
    }

    assertLapTransition("CRITIQUING", "GENERATING");
    updateLapStatus(db, lap.id, "GENERATING");
    const generated = stubGenerate(plan);
    const { emitted, dropped } = resolveLiveValidation(generated.scenarios); // TG-7
    for (const drop of dropped) {
      appendEvent(db, clock, {
        sessionId,
        lapId: lap.id,
        actor: "generator",
        type: "generate.dropped",
        payload: drop,
      });
    }
    appendEvent(db, clock, {
      sessionId,
      lapId: lap.id,
      actor: "generator",
      type: "generate.validated",
      payload: { emitted: emitted.length, dropped: dropped.length },
    });

    assertLapTransition("GENERATING", "RUNNING");
    updateLapStatus(db, lap.id, "RUNNING");
    const runs = stubRun(lap.id, { ...generated, scenarios: emitted }, deps);
    for (const run of runs) {
      putRun(db, run);
      appendEvent(db, clock, {
        sessionId,
        lapId: lap.id,
        actor: "runner",
        type: "run.started",
        payload: { runId: run.id, scenarioId: run.scenarioId },
      });
      appendEvent(db, clock, {
        sessionId,
        lapId: lap.id,
        actor: "runner",
        type: "step.finished",
        payload: { runId: run.id, status: run.status },
      });
    }
    if (!allTerminal(runs)) throw new Error("TG-8 refused: a run did not reach a terminal status"); // TG-8

    assertLapTransition("RUNNING", "BANKED");
    const banked = bankLap(db, deps, lap.id, "VERIFIED");
    bankedCapabilityIds.add(capability.id);
    appendEvent(db, clock, {
      sessionId,
      lapId: banked.id,
      actor: "orchestrator",
      type: "lap.banked",
      payload: { outcome: banked.outcome },
    });

    if (
      options.stopAfterLapsBanked !== undefined &&
      bankedCapabilityIds.size >= options.stopAfterLapsBanked
    ) {
      return getSession(db, sessionId) as Session; // simulated kill — session stays LAPPING
    }
  }

  const backlogRemaining = backlog.filter((c) => !bankedCapabilityIds.has(c.id)).length;
  const lappingTransition = afterLapping(backlogRemaining, false); // TG-11
  if (!lappingTransition) return getSession(db, sessionId) as Session; // unreachable

  assertSessionTransition("LAPPING", "REPORTING");
  session = updateSessionStatus(db, sessionId, "REPORTING");
  appendEvent(db, clock, {
    sessionId,
    lapId: null,
    actor: "reporter",
    type: "report.generated",
    payload: { partial: lappingTransition.partial },
  });

  const terminal = lappingTransition.partial ? "COMPLETED_PARTIAL" : "COMPLETED";
  assertSessionTransition("REPORTING", terminal);
  const exitCode = exitCodeFor(terminal, defectsFound);
  session = updateSessionStatus(db, sessionId, terminal, {
    exitCode,
    defectsFound,
    finishedAt: clock.now().toISOString(),
  });
  appendEvent(db, clock, {
    sessionId,
    lapId: null,
    actor: "orchestrator",
    type: "session.finished",
    payload: { status: terminal, exitCode },
  });

  return session;
}
