// packages/agents/explorer/src/frontier.ts — 09 §3: the frontier loop. The model has
// the tools; the driver has the loop — walking happens in deterministic code between
// model turns, and every ceiling below is a counter checked every iteration, never a
// prompt instruction (06 §2.2, ADR-008).
import {
  buildCapabilities,
  type Affordance,
  type Capability,
  type CapabilityMap,
  type Clock,
  type IdGen,
  type State,
  type Transition,
} from "@forge/core";
import {
  detectLoginForm,
  interactiveNodes,
  rawAffordancesOf,
  stateSignature,
  type AccessibilitySnapshot,
} from "@forge/perception";
import { authenticate, sameOrigin, type Credentials } from "./auth.js";
import type { BrowserDriver } from "./driver.js";
import { compareFrontierItems, frontierValue, type FrontierItem } from "./value.js";

export type ExploreBudget = {
  /** FR-107 defaults — 09 §3.4. */
  maxStates: number;
  wallClockMs: number;
  modelToolCalls: number;
  modelTurns: number;
};

export const DEFAULT_EXPLORE_BUDGET: ExploreBudget = {
  maxStates: 40,
  wallClockMs: 90_000,
  modelToolCalls: 40,
  modelTurns: 8,
};

const FRONTIER_BATCH = 40;
const VISITED_VARIANTS_STOP = 20;

export type HaltReason = CapabilityMap["frontier"]["haltReason"];

export type BatchDecision = {
  chosen: FrontierItem[];
  source: "llm" | "deterministic";
  /** The model's own targeted-probe tool calls spent producing this decision — counts
   * against `budget.modelToolCalls`, separately from driver expansions (09 §3.1). */
  toolCallsUsed?: number;
};
export type ChooseBatch = (
  batch: readonly FrontierItem[],
  ctx: { states: ReadonlyMap<string, State> },
) => Promise<BatchDecision>;

/** Fallback (NFR-2): top min(6, batch.length) by the value sort — 09 §3.5. */
export const deterministicChooseBatch: ChooseBatch = async (batch) => ({
  chosen: [...batch].sort(compareFrontierItems).slice(0, Math.min(6, batch.length)),
  source: "deterministic",
});

export type ExploreInput = {
  url: string;
  credentials?: Credentials;
  intent?: string;
  budget?: Partial<ExploreBudget>;
};

export type ExploreDeps = {
  driver: BrowserDriver;
  clock: Clock;
  idGen: IdGen;
  sessionId: string;
  /** Call site 1. Defaults to the deterministic fallback — EC-02 asserts this path. */
  chooseBatch?: ChooseBatch;
};

export type ExploreResult = {
  map: CapabilityMap;
  /** Every affordance discovered, including deny-listed / off-origin / disabled ones
   * (mirroring `stubExplore`'s shape) — `CapabilityMap.states[].affordanceIds` are
   * references, not the rows themselves. */
  affordances: Affordance[];
  modelCallsMade: number;
  source: "llm" | "deterministic";
};

export async function explore(input: ExploreInput, deps: ExploreDeps): Promise<ExploreResult> {
  const budget: ExploreBudget = { ...DEFAULT_EXPLORE_BUDGET, ...input.budget };
  const chooseBatch = deps.chooseBatch ?? deterministicChooseBatch;
  const { driver, idGen, sessionId, clock } = deps;
  const startedAtMs = clock.now().getTime();

  const statesBySignature = new Map<string, State>();
  const affordancesByState = new Map<string, Affordance[]>();
  const admittedKeys = new Set<string>();
  const exercisedAffordanceIds = new Set<string>();
  const outDegreeSoFar = new Map<string, number>();
  const transitions: Transition[] = [];
  const frontier: FrontierItem[] = [];

  let modelCallsMade = 0;
  let sawLlmBatch = false;
  let authenticated = false;
  let loginStateId: string | undefined;
  let modelToolCallsUsed = 0;
  let modelTurnsUsed = 0;
  // The entry state's *resolved* origin, not the raw input — a target that redirects
  // http→https or bare→www would otherwise flag its own links OFF_ORIGIN. Updated
  // once the first navigation resolves, just below.
  let originUrl = input.url;

  function withinStateAndTimeBudget(): boolean {
    if (statesBySignature.size >= budget.maxStates) return false;
    if (clock.now().getTime() - startedAtMs >= budget.wallClockMs) return false;
    return true;
  }

  function admit(snapshot: AccessibilitySnapshot): State {
    const signature = stateSignature(snapshot);
    let state = statesBySignature.get(signature);
    const isNew = !state;
    if (!state) {
      state = {
        id: idGen.next("st"),
        sessionId,
        signature,
        url: snapshot.url,
        title: snapshot.title,
        authRequired: authenticated,
        snapshotEvidenceId: idGen.next("ev"),
        affordanceIds: [],
        visitedVariants: 1,
        discoveredAt: clock.now().toISOString(),
      };
      statesBySignature.set(signature, state);
      affordancesByState.set(state.id, []);
    } else {
      state.visitedVariants += 1;
    }

    // 09 §4: past 20 variants, this is a list — stop admitting new affordances.
    if (!isNew && state.visitedVariants > VISITED_VARIANTS_STOP) return state;

    const nodes = interactiveNodes(snapshot.root);
    const raws = rawAffordancesOf(snapshot);
    for (let i = 0; i < raws.length; i++) {
      const raw = raws[i];
      if (!raw) continue;
      const key = `${state.id}:${raw.ref}`;
      if (admittedKeys.has(key)) continue;
      admittedKeys.add(key);

      const affordance: Affordance = { ...raw, id: idGen.next("af"), stateId: state.id };
      const href = nodes[i]?.href;

      let excluded = false;
      if (affordance.destructive) {
        excluded = true; // already observedNotExercised/DENY_LIST from perception — I-20
      } else if (href && !sameOrigin(href, originUrl)) {
        affordance.observedNotExercised = true;
        affordance.notExercisedReason = "OFF_ORIGIN";
        excluded = true;
      } else if (!affordance.enabled) {
        affordance.observedNotExercised = true;
        affordance.notExercisedReason = "DISABLED";
        excluded = true;
      }

      affordancesByState.get(state.id)?.push(affordance);
      state.affordanceIds.push(affordance.id);

      if (!excluded) {
        frontier.push({
          affordance,
          fromStateId: state.id,
          value: frontierValue(affordance, outDegreeSoFar.get(state.id) ?? 0),
        });
      }
    }
    return state;
  }

  // ── seed: navigate, authenticate, observe the entry state — 09 §3.2 ─────────────
  await driver.navigate(input.url);
  const firstObserved = await driver.observe();
  let haltReason: HaltReason = "EXHAUSTED";

  if (firstObserved.ok) {
    originUrl = firstObserved.data.snapshot.url;
    const entryState = admit(firstObserved.data.snapshot);
    if (detectLoginForm(firstObserved.data.snapshot)) loginStateId = entryState.id;

    const authResult = await authenticate(driver, firstObserved.data.snapshot, input.credentials);
    authenticated = authResult.authenticated;
    if (
      authenticated &&
      authResult.finalSnapshot &&
      authResult.finalSnapshot.url !== firstObserved.data.snapshot.url
    ) {
      admit(authResult.finalSnapshot);
    }

    // ── the loop — 09 §3.2 ─────────────────────────────────────────────────────
    while (frontier.length > 0 && withinStateAndTimeBudget()) {
      if (modelTurnsUsed >= budget.modelTurns || modelToolCallsUsed >= budget.modelToolCalls) {
        haltReason = "CALL_BUDGET";
        break;
      }

      frontier.sort(compareFrontierItems);
      const batch = frontier.splice(0, FRONTIER_BATCH);
      const decision = await chooseBatch(batch, { states: statesBySignature });
      if (decision.source === "llm") {
        sawLlmBatch = true;
        modelCallsMade += 1;
        modelTurnsUsed += 1;
        modelToolCallsUsed += decision.toolCallsUsed ?? 0;
      }

      for (const item of decision.chosen) {
        if (!withinStateAndTimeBudget()) break;

        const fromState = [...statesBySignature.values()].find((s) => s.id === item.fromStateId);
        if (!fromState) continue;
        outDegreeSoFar.set(fromState.id, (outDegreeSoFar.get(fromState.id) ?? 0) + 1);

        if (driver.currentUrl() !== fromState.url) {
          const restored = await driver.navigate(fromState.url);
          if (!restored.ok) continue;
          const check = await driver.observe();
          if (!check.ok || stateSignature(check.data.snapshot) !== fromState.signature) continue; // restore mismatch
        }

        const acted = await driver.exercise(item.affordance);
        if (!acted.ok) continue; // ACTION_DENIED / LOCATOR_NOT_FOUND — nothing to record

        exercisedAffordanceIds.add(item.affordance.id);
        const afterObserved = await driver.observe();
        if (!afterObserved.ok) continue;

        const toState = admit(afterObserved.data.snapshot);
        transitions.push({
          id: idGen.next("tr"),
          sessionId,
          fromStateId: fromState.id,
          toStateId: toState.id,
          viaAffordanceId: item.affordance.id,
          action: acted.data.action === "back" ? "click" : acted.data.action,
          observedAt: clock.now().toISOString(),
        });
      }
    }

    if (haltReason !== "CALL_BUDGET") {
      if (frontier.length === 0) haltReason = "EXHAUSTED";
      else if (statesBySignature.size >= budget.maxStates) haltReason = "STATE_BUDGET";
      else haltReason = "TIME_BUDGET";
    }
  } else {
    haltReason = "TIME_BUDGET"; // couldn't even observe the entry state
  }

  // Anything left un-exercised because a budget bound — not because it was denied or
  // off-origin — is recorded as such (09 §3.3's "on a state discovered at or past
  // the state budget" row; generalised here to whichever budget actually bound).
  if (haltReason !== "EXHAUSTED") {
    for (const list of affordancesByState.values()) {
      for (const a of list) {
        if (!a.destructive && !a.observedNotExercised && !exercisedAffordanceIds.has(a.id)) {
          a.observedNotExercised = true;
          a.notExercisedReason = haltReason;
        }
      }
    }
  }

  const states = [...statesBySignature.values()];
  const affordances = [...affordancesByState.values()].flat();
  const capabilities: Capability[] = buildCapabilities(
    { states, transitions, affordances, ...(loginStateId ? { loginStateId } : {}) },
    sessionId,
    idGen,
    input.intent,
  );

  const map: CapabilityMap = {
    sessionId,
    authenticated,
    states,
    transitions,
    capabilities,
    apiHints: [],
    frontier: { discovered: states.length, explored: states.length, haltReason },
  };

  return { map, affordances, modelCallsMade, source: sawLlmBatch ? "llm" : "deterministic" };
}
