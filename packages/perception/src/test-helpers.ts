// packages/perception/src/test-helpers.ts — not exported from index.ts; imported
// directly by this package's own tests to build small snapshots inline.
import type { AccessibilitySnapshot, SnapshotNode } from "./types.js";

export function node(
  role: string,
  props: Partial<Omit<SnapshotNode, "role" | "children">> = {},
  children: SnapshotNode[] = [],
): SnapshotNode {
  return { role, name: null, ref: null, children, ...props };
}

export function snap(
  url: string,
  root: SnapshotNode,
  opts: Partial<Pick<AccessibilitySnapshot, "title" | "raw">> = {},
): AccessibilitySnapshot {
  return {
    url,
    title: opts.title ?? "Test",
    root,
    raw: opts.raw ?? { interactiveCount: 0, domBytes: 0 },
  };
}
