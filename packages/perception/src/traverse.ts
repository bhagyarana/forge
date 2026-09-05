// packages/perception/src/traverse.ts — deterministic traversal order is the whole
// contract: refs, the destructive scan and the signature skeleton all depend on
// visiting nodes in the same order every time (08 §2 — "refs are ours, not
// Playwright's... assigned deterministically by traversal order").
import type { SnapshotNode } from "./types.js";

const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "checkbox",
  "radio",
  "combobox",
  "tab",
  "menuitem",
  "switch",
  "searchbox",
  "spinbutton",
]);

export function isInteractiveRole(role: string): boolean {
  return INTERACTIVE_ROLES.has(role);
}

/** Depth-first, pre-order — the traversal order refs and signatures are keyed on. */
export function* walk(node: SnapshotNode): Generator<SnapshotNode> {
  yield node;
  for (const child of node.children) yield* walk(child);
}

export function interactiveNodes(root: SnapshotNode): SnapshotNode[] {
  return [...walk(root)].filter((n) => n.ref !== null);
}
