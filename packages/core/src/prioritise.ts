// packages/core/src/prioritise.ts — 09 §5, §6: capability clustering and the
// six-factor risk ranking. Pure, deterministic — "same map in, same order out" (I-17).
//
// The reference doc (09 §6.2) sketches this file at `packages/orchestrator/src/
// prioritise.ts`. It lives in `packages/core` instead: the frontier loop's own
// `assemble()` step needs `cluster()`/`rank()` to build the CapabilityMap it returns
// (09 §3.2), but `.dependency-cruiser.cjs`'s `agents-cannot-persist` rule forbids
// `packages/agents/*` from importing `packages/orchestrator` at all — and rightly so,
// that rule is what stops a sub-agent from reaching the event log. `packages/core` is
// already a dependency of both `packages/agents/explorer` and `packages/orchestrator`,
// and "pure, I/O-free algorithm over stored shapes" is exactly what `packages/core` is
// for — more precisely, in fact, than the illustrative path in the doc.
import type { Affordance, Capability, RiskFactors, State, Transition } from "../schema/index.js";
import type { IdGen } from "./env.js";

// ── route templating — duplicated (not imported) from packages/perception/src/
// signature.ts on purpose: `core-is-pure` forbids core from depending on perception,
// and this is ~10 lines, not worth a shared package for. ────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_RE = /^\d+$/;

function pathSegments(rawUrl: string): string[] {
  // `State.url` is not schema-constrained to be an absolute URL (05 §2.3), and in
  // practice it always is one in a live crawl (`page.url()`); fall back to treating
  // the raw string as a bare path so a bare "/checkout"-style fixture still segments.
  let pathname: string;
  try {
    pathname = new URL(rawUrl).pathname;
  } catch {
    pathname = rawUrl.split("?")[0] ?? rawUrl;
  }
  return pathname
    .split("/")
    .filter((s) => s.length > 0)
    .map((seg) => (NUMERIC_RE.test(seg) || UUID_RE.test(seg) ? ":id" : seg));
}

// ── §5.1 pass 1 — strip global navigation ───────────────────────────────────────────
const GLOBAL_NAV_THRESHOLD = 0.6;

function affordanceKey(a: Pick<Affordance, "role" | "accessibleName">): string {
  return `${a.role}::${a.accessibleName ?? ""}`;
}

/** The set of (role, accessibleName) pairs appearing on ≥60% of states — headers, footers. */
function globalNavKeys(
  states: readonly State[],
  affordancesByState: Map<string, Affordance[]>,
): Set<string> {
  const stateCountByKey = new Map<string, number>();
  for (const state of states) {
    const seenOnThisState = new Set<string>();
    for (const a of affordancesByState.get(state.id) ?? []) {
      seenOnThisState.add(affordanceKey(a));
    }
    for (const key of seenOnThisState) {
      stateCountByKey.set(key, (stateCountByKey.get(key) ?? 0) + 1);
    }
  }
  const threshold = GLOBAL_NAV_THRESHOLD * states.length;
  const keys = new Set<string>();
  for (const [key, count] of stateCountByKey) {
    if (count >= threshold) keys.add(key);
  }
  return keys;
}

// ── §5.1 pass 2 — weakly connected components ───────────────────────────────────────
function connectedComponents(
  states: readonly State[],
  edges: readonly [string, string][],
): string[][] {
  const adjacency = new Map<string, Set<string>>();
  for (const state of states) adjacency.set(state.id, new Set());
  for (const [a, b] of edges) {
    adjacency.get(a)?.add(b);
    adjacency.get(b)?.add(a);
  }

  const visited = new Set<string>();
  const components: string[][] = [];
  for (const state of states) {
    if (visited.has(state.id)) continue;
    const component: string[] = [];
    const stack = [state.id];
    visited.add(state.id);
    while (stack.length > 0) {
      const current = stack.pop() as string;
      component.push(current);
      for (const neighbour of adjacency.get(current) ?? []) {
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          stack.push(neighbour);
        }
      }
    }
    // discovery order, not traversal order — 09 §5.2's "stateIds in discovery order".
    const byDiscovery = new Set(component);
    components.push(states.filter((s) => byDiscovery.has(s.id)).map((s) => s.id));
  }
  return components;
}

export type ClusterInput = {
  states: readonly State[];
  transitions: readonly Transition[];
  affordances: readonly Affordance[];
  /**
   * The state `detectLoginForm()` identified as the auth gate (09 §2), when the
   * Explorer found one. `buildCapabilities()` uses it to resolve ADR-012 A1's
   * "depends on the cluster containing the login state" precisely; without it, the
   * best `packages/core` can do on transitions alone is the first observed
   * unauthenticated→authenticated edge, which is a reasonable fallback but not
   * always the actual login state.
   */
  loginStateId?: string;
};

export type ClusterDraft = {
  stateIds: string[];
  entryStateId: string;
  exitConditions: string[];
};

const MAX_CLUSTER_STATES = 8;

function stateById(states: readonly State[]): Map<string, State> {
  return new Map(states.map((s) => [s.id, s]));
}

function mergeByFirstSegment(components: string[][], statesById: Map<string, State>): string[][] {
  const groups = new Map<string, string[]>();
  const ungrouped: string[][] = [];
  for (const component of components) {
    const entry = component[0];
    const state = entry ? statesById.get(entry) : undefined;
    const first = state ? pathSegments(state.url)[0] : undefined;
    if (!first) {
      ungrouped.push(component);
      continue;
    }
    const existing = groups.get(first);
    if (existing) existing.push(...component);
    else groups.set(first, [...component]);
  }
  return [...groups.values(), ...ungrouped];
}

function splitOversized(components: string[][], statesById: Map<string, State>): string[][] {
  const result: string[][] = [];
  for (const component of components) {
    if (component.length <= MAX_CLUSTER_STATES) {
      result.push(component);
      continue;
    }
    const bySecondSegment = new Map<string, string[]>();
    for (const stateId of component) {
      const state = statesById.get(stateId);
      const second = state ? (pathSegments(state.url)[1] ?? "") : "";
      const existing = bySecondSegment.get(second);
      if (existing) existing.push(stateId);
      else bySecondSegment.set(second, [stateId]);
    }
    result.push(...bySecondSegment.values());
  }
  return result;
}

/** In-degree of `stateId` from transitions whose source lies outside `component`. */
function externalInDegree(
  stateId: string,
  component: Set<string>,
  transitions: readonly Transition[],
): number {
  return transitions.filter((t) => t.toStateId === stateId && !component.has(t.fromStateId)).length;
}

function attachOrphans(components: string[][], transitions: readonly Transition[]): string[][] {
  const orphanIndices = components.map((c, i) => (c.length === 1 ? i : -1)).filter((i) => i >= 0);
  if (orphanIndices.length === 0) return components;

  const result = components.map((c) => [...c]);
  const removed = new Set<number>();

  for (const orphanIndex of orphanIndices) {
    const orphanStateId = components[orphanIndex]?.[0];
    if (!orphanStateId) continue;
    const incoming = transitions.filter((t) => t.toStateId === orphanStateId);
    if (incoming.length === 0) continue; // stays its own capability

    const countByComponent = new Map<number, number>();
    for (const t of incoming) {
      const targetIndex = result.findIndex(
        (c, i) => !removed.has(i) && i !== orphanIndex && c.includes(t.fromStateId),
      );
      if (targetIndex >= 0)
        countByComponent.set(targetIndex, (countByComponent.get(targetIndex) ?? 0) + 1);
    }
    if (countByComponent.size === 0) continue;

    let bestIndex = -1;
    let bestCount = -1;
    for (const [index, count] of countByComponent) {
      if (count > bestCount) {
        bestCount = count;
        bestIndex = index;
      }
    }
    if (bestIndex >= 0) {
      result[bestIndex]?.push(orphanStateId);
      removed.add(orphanIndex);
    }
  }
  return result.filter((_, i) => !removed.has(i));
}

function entryStateOf(component: readonly string[], transitions: readonly Transition[]): string {
  const componentSet = new Set(component);
  let best = component[0] as string;
  let bestScore = -1;
  for (const stateId of component) {
    const score = externalInDegree(stateId, componentSet, transitions);
    if (score > bestScore) {
      bestScore = score;
      best = stateId;
    }
  }
  return best;
}

function exitConditionsOf(
  component: readonly string[],
  entryStateId: string,
  transitions: readonly Transition[],
  statesById: Map<string, State>,
): string[] {
  const componentSet = new Set(component);
  const outsideTitles = new Set<string>();
  for (const t of transitions) {
    if (componentSet.has(t.fromStateId) && !componentSet.has(t.toStateId)) {
      const title = statesById.get(t.toStateId)?.title;
      if (title) outsideTitles.add(title);
    }
  }
  if (outsideTitles.size === 0) {
    const entryTitle = statesById.get(entryStateId)?.title ?? "the entry state";
    return [`returns to ${entryTitle}`];
  }
  return [...outsideTitles];
}

/** Deterministic, five passes over the state graph — 09 §5.1. */
export function cluster(input: ClusterInput): ClusterDraft[] {
  const { states, transitions, affordances } = input;
  if (states.length === 0) return [];

  const affordancesByState = new Map<string, Affordance[]>();
  for (const a of affordances) {
    const list = affordancesByState.get(a.stateId);
    if (list) list.push(a);
    else affordancesByState.set(a.stateId, [a]);
  }
  const affordanceById = new Map(affordances.map((a) => [a.id, a]));

  // Pass 1 — strip transitions that ride a global-nav affordance. Everything
  // downstream — connectivity, entry-state in-degree, exit conditions, orphan
  // attachment — uses this filtered set, not the raw transitions: a header link is
  // on every page by construction, so leaving it in would re-inflate exactly the
  // in-degree and reachability signals pass 1 exists to clean up.
  const navKeys = globalNavKeys(states, affordancesByState);
  const clusteringTransitions = transitions.filter((t) => {
    const via = affordanceById.get(t.viaAffordanceId);
    return !via || !navKeys.has(affordanceKey(via));
  });
  const clusteringEdges: [string, string][] = clusteringTransitions.map((t) => [
    t.fromStateId,
    t.toStateId,
  ]);

  // Pass 2 — weakly connected components.
  let components = connectedComponents(states, clusteringEdges);

  const statesById = stateById(states);
  // Pass 3 — merge by first route-template segment.
  components = mergeByFirstSegment(components, statesById);
  // Pass 4 — split any cluster above 8 states by second route segment.
  components = splitOversized(components, statesById);
  // Pass 5 — attach single-state orphans to whatever most often leads into them.
  components = attachOrphans(components, clusteringTransitions);

  return components.map((component) => {
    const entryStateId = entryStateOf(component, clusteringTransitions);
    return {
      stateIds: component,
      entryStateId,
      exitConditions: exitConditionsOf(component, entryStateId, clusteringTransitions, statesById),
    };
  });
}

// ── §5.2 naming — the fallback half; the model's naming call is the Explorer's job ──
function titleCase(segment: string): string {
  return segment
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function longestCommonRouteSegment(
  component: readonly string[],
  statesById: Map<string, State>,
): string | null {
  const segmentLists = component.map((id) => pathSegments(statesById.get(id)?.url ?? ""));
  const first = segmentLists[0];
  if (!first) return null;
  for (const segment of first) {
    if (segment === ":id") continue;
    if (segmentLists.every((segs) => segs.includes(segment))) return segment;
  }
  return first.find((s) => s !== ":id") ?? null;
}

/** Fallback naming, with no model — 09 §5.2. The real naming call is agentic. */
export function nameCluster(
  draft: ClusterDraft,
  statesById: Map<string, State>,
): { name: string; description: string } {
  const entry = statesById.get(draft.entryStateId);
  const common = longestCommonRouteSegment(draft.stateIds, statesById);
  const name = common ? titleCase(common) : (entry?.title ?? "Entry point");
  const description = `A capability discovered around ${entry?.url ?? "the entry state"}, covering ${draft.stateIds.length} state(s).`;
  return { name, description };
}

// ── 09 §6 — risk ranking ─────────────────────────────────────────────────────────────
export const RISK_WEIGHTS = {
  moneyOrPii: 0.28,
  dataMutation: 0.22,
  authProximity: 0.15,
  graphCentrality: 0.15,
  affordanceDensity: 0.1,
  statedIntent: 0.1,
} as const satisfies Record<keyof RiskFactors, number>;

const MONEY_OR_PII_LEXICON = [
  "card",
  "credit",
  "payment",
  "pay",
  "price",
  "total",
  "invoice",
  "billing",
  "iban",
  "cvv",
  "ssn",
  "passport",
  "dob",
  "address",
  "phone",
  "email",
  "password",
];

function lexiconHits(haystacks: readonly string[]): number {
  const text = haystacks.join(" ").toLowerCase();
  let hits = 0;
  for (const term of MONEY_OR_PII_LEXICON) {
    if (text.includes(term)) hits += 1;
  }
  return hits;
}

function jaccard(a: readonly string[], b: readonly string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let intersection = 0;
  for (const t of sa) if (sb.has(t)) intersection += 1;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : intersection / union;
}

// Excluded from the Jaccard overlap so two unrelated sentences don't "match" purely
// because both happen to contain "the" — the doc's formula (09 §6.1) does not spell
// this out, but without it `statedIntent` would fire on almost any input.
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "by",
  "for",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "with",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

export type RiskContext = {
  input: ClusterInput;
  allDrafts: readonly ClusterDraft[];
  authClusterIndex: number | null; // the cluster containing the login/auth-boundary state
  name: string;
  description: string;
  intent?: string | undefined;
};

/** Every factor computed from the map, none guessed — 09 §6.1. */
export function computeRiskFactors(draft: ClusterDraft, ctx: RiskContext): RiskFactors {
  const statesById = stateById(ctx.input.states);
  const componentSet = new Set(draft.stateIds);
  const clusterStates = draft.stateIds
    .map((id) => statesById.get(id))
    .filter((s): s is State => !!s);
  const clusterAffordances = ctx.input.affordances.filter((a) => componentSet.has(a.stateId));

  // The lexicon also covers `autocomplete` values (09 §6.1); `Affordance` does not
  // carry that DOM fact, so route templates and accessible names are what we have.
  const routeTemplates = clusterStates.map((s) => `/${pathSegments(s.url).join("/")}`);
  const names = clusterAffordances.map((a) => a.accessibleName ?? "");
  const moneyOrPii = Math.min(1, lexiconHits([...routeTemplates, ...names]) / 3);

  const hasObservedSubmit = ctx.input.transitions.some(
    (t) => componentSet.has(t.fromStateId) && t.action === "submit",
  );
  const hasUnprovenTextbox = clusterAffordances.some(
    (a) => a.kind === "textbox" && !hasObservedSubmit,
  );
  const dataMutation = hasObservedSubmit ? 1.0 : hasUnprovenTextbox ? 0.6 : 0.0;

  const allAuthRequired = clusterStates.length > 0 && clusterStates.every((s) => s.authRequired);
  const touchesAuthBoundary =
    ctx.authClusterIndex !== null &&
    ctx.input.transitions.some(
      (t) =>
        (componentSet.has(t.fromStateId) &&
          ctx.allDrafts[ctx.authClusterIndex as number]?.stateIds.includes(t.toStateId)) ||
        (componentSet.has(t.toStateId) &&
          ctx.allDrafts[ctx.authClusterIndex as number]?.stateIds.includes(t.fromStateId)),
    );
  const authProximity = allAuthRequired ? 1.0 : touchesAuthBoundary ? 0.6 : 0.0;

  const inDegrees = ctx.allDrafts.map((d) => {
    const set = new Set(d.stateIds);
    return ctx.input.transitions.filter((t) => set.has(t.toStateId) && !set.has(t.fromStateId))
      .length;
  });
  const maxInDegree = Math.max(1, ...inDegrees);
  const ownInDegree = externalInDegree(draft.entryStateId, componentSet, ctx.input.transitions);
  const graphCentrality = ownInDegree / maxInDegree;

  const densities = ctx.allDrafts.map((d) => {
    const set = new Set(d.stateIds);
    return ctx.input.affordances.filter((a) => set.has(a.stateId)).length;
  });
  const maxDensity = Math.max(1, ...densities);
  const affordanceDensity = clusterAffordances.length / maxDensity;

  const statedIntent = ctx.intent
    ? jaccard(tokenize(ctx.intent), tokenize(`${ctx.name} ${ctx.description}`))
    : 0;

  return {
    moneyOrPii,
    dataMutation,
    authProximity,
    graphCentrality,
    affordanceDensity,
    statedIntent,
  };
}

export function riskScore(factors: RiskFactors): number {
  return (
    RISK_WEIGHTS.moneyOrPii * factors.moneyOrPii +
    RISK_WEIGHTS.dataMutation * factors.dataMutation +
    RISK_WEIGHTS.authProximity * factors.authProximity +
    RISK_WEIGHTS.graphCentrality * factors.graphCentrality +
    RISK_WEIGHTS.affordanceDensity * factors.affordanceDensity +
    RISK_WEIGHTS.statedIntent * factors.statedIntent
  );
}

/**
 * Pure · same map in, same order out (I-17). Intent is a promotion, not a weight —
 * 09 §6.2 — because a 0.10 weight cannot guarantee a top-3 finish against a
 * high-risk unnamed capability, and a lexicographic promotion can.
 */
export function rank(capabilities: readonly Capability[], intent?: string): Capability[] {
  const intentTokens = intent ? tokenize(intent) : [];
  const matchesIntent = (c: Capability): boolean =>
    intentTokens.length > 0 && jaccard(intentTokens, tokenize(`${c.name} ${c.description}`)) > 0;

  const sorted = [...capabilities].sort((a, b) => {
    const aPromoted = matchesIntent(a) ? 0 : 1;
    const bPromoted = matchesIntent(b) ? 0 : 1;
    if (aPromoted !== bPromoted) return aPromoted - bPromoted;
    if (a.risk.score !== b.risk.score) return b.risk.score - a.risk.score;
    return a.name.localeCompare(b.name);
  });

  return sorted.map((c, index) => ({ ...c, priorityRank: index }));
}

/** The composition: cluster → name → score → mint ids → rank. What `explore()` calls. */
export function buildCapabilities(
  input: ClusterInput,
  sessionId: string,
  idGen: IdGen,
  intent?: string,
): Capability[] {
  const drafts = cluster(input);
  const statesById = stateById(input.states);

  const authClusterIndex = (() => {
    if (input.loginStateId) {
      const index = drafts.findIndex((d) => d.stateIds.includes(input.loginStateId as string));
      if (index >= 0) return index;
    }
    // Fallback: the first observed unauthenticated→authenticated edge. Reasonable
    // when the Explorer never resolved a login state at all (e.g. `TG-2`'s degrade),
    // but see the `loginStateId` doc comment above for why it is only a fallback.
    const boundary = input.transitions.find((t) => {
      const from = statesById.get(t.fromStateId);
      const to = statesById.get(t.toStateId);
      return from && to && !from.authRequired && to.authRequired;
    });
    if (!boundary) return null;
    const index = drafts.findIndex((d) => d.stateIds.includes(boundary.fromStateId));
    return index >= 0 ? index : null;
  })();

  const named = drafts.map((d) => ({ draft: d, ...nameCluster(d, statesById) }));

  const capabilities: Capability[] = named.map(({ draft, name, description }) => {
    const factors = computeRiskFactors(draft, {
      input,
      allDrafts: drafts,
      authClusterIndex,
      name,
      description,
      intent,
    });
    return {
      id: idGen.next("cap"),
      sessionId,
      name,
      description,
      entryStateId: draft.entryStateId,
      stateIds: draft.stateIds,
      exitConditions: draft.exitConditions,
      dependsOn: [], // resolved below, once every capability has a minted id
      risk: { score: riskScore(factors), factors },
      priorityRank: 0,
    };
  });

  // ADR-012 A1: a cluster whose states are all authRequired depends on the cluster
  // containing the login state — resolved here, now that every capability has an id.
  if (authClusterIndex !== null) {
    const authCapabilityId = capabilities[authClusterIndex]?.id;
    if (authCapabilityId) {
      for (const [i, draft] of drafts.entries()) {
        if (i === authClusterIndex) continue;
        const allAuthRequired = draft.stateIds.every((id) => statesById.get(id)?.authRequired);
        if (allAuthRequired) capabilities[i]!.dependsOn = [authCapabilityId];
      }
    }
  }

  return rank(capabilities, intent);
}
