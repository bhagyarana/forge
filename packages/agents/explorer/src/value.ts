// packages/agents/explorer/src/value.ts — 09 §3.3: the deterministic value heuristic.
// This sort **is** the no-model fallback (NFR-2) — pure, no browser, no model.
import type { Affordance } from "@forge/core";

/** Not specified numerically in 09 §3.3; documented assumption, one exported constant. */
export const MAX_FANOUT = 10;

export function isNavigational(a: Pick<Affordance, "kind">): boolean {
  return a.kind === "link" || a.kind === "tab" || a.kind === "menuitem";
}

/** A non-destructive submit-shaped control — reveals an outcome state. */
export function isFormSubmit(a: Pick<Affordance, "kind" | "destructive">): boolean {
  return a.kind === "button" && !a.destructive;
}

const ICON_GLYPH_RE = /^[^a-zA-Z0-9]{1,2}$/;

/** Non-empty and not a bare icon glyph ("×", "»", …). */
export function nameInformative(name: string | null): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  return trimmed.length > 1 && !ICON_GLYPH_RE.test(trimmed);
}

export type FrontierItem = {
  affordance: Affordance;
  fromStateId: string;
  value: number;
};

/**
 * `value = 0.40·navigational + 0.25·formSubmit + 0.20·nameInformative
 *        + 0.15·(1 - fanoutSoFar/MAX_FANOUT)` — 09 §3.3.
 */
export function frontierValue(a: Affordance, stateFanoutSoFar: number): number {
  const spread = Math.max(0, 1 - stateFanoutSoFar / MAX_FANOUT);
  return (
    0.4 * (isNavigational(a) ? 1 : 0) +
    0.25 * (isFormSubmit(a) ? 1 : 0) +
    0.2 * (nameInformative(a.accessibleName) ? 1 : 0) +
    0.15 * spread
  );
}

/** Descending by value; tie-break (stateId, ref) ascending — stable across runs. */
export function compareFrontierItems(a: FrontierItem, b: FrontierItem): number {
  if (a.value !== b.value) return b.value - a.value;
  if (a.fromStateId !== b.fromStateId) return a.fromStateId.localeCompare(b.fromStateId);
  return a.affordance.ref.localeCompare(b.affordance.ref);
}
