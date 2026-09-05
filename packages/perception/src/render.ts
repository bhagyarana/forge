// packages/perception/src/render.ts — the compact text form of a snapshot (08 §2's
// worked example): what actually goes into a model prompt, and what the 8 KB budget
// is measured against.
import type { AccessibilitySnapshot, SnapshotNode } from "./types.js";

function renderNode(node: SnapshotNode, depth: number, out: string[]): void {
  const attrs: string[] = [];
  if (node.ref) attrs.push(`ref=${node.ref}`);
  if (node.level !== undefined) attrs.push(`level=${node.level}`);
  if (node.enabled === false) attrs.push("disabled");
  const attrStr = attrs.length > 0 ? ` [${attrs.join("] [")}]` : "";
  const nameStr = node.name ? ` "${node.name}"` : "";
  out.push(`${"  ".repeat(depth)}- ${node.role}${nameStr}${attrStr}`);
  for (const child of node.children) renderNode(child, depth + 1, out);
}

/** The root is a synthetic document wrapper and is never itself printed. */
export function renderSnapshotText(snap: AccessibilitySnapshot): string {
  const out: string[] = [];
  for (const child of snap.root.children) renderNode(child, 0, out);
  return out.join("\n");
}

export function snapshotByteSize(snap: AccessibilitySnapshot): number {
  return Buffer.byteLength(renderSnapshotText(snap), "utf8");
}
