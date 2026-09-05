// packages/perception/src/fixtures.ts — loads fixtures/perception/*.snapshot.yaml
// (16 §3.6, Ph2.1). These are hand-authored, structurally faithful captures of three
// different kinds of page, recorded before any detector existed against them.
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { AccessibilitySnapshot, SnapshotNode } from "./types.js";

type FixtureNode = {
  role: string;
  name?: string;
  ref?: string;
  level?: number;
  enabled?: boolean;
  inputType?: string;
  autocomplete?: string;
  attrName?: string;
  attrId?: string;
  placeholder?: string;
  href?: string;
  children?: FixtureNode[];
};

type FixtureDoc = {
  url: string;
  title: string;
  raw?: { domBytes?: number };
  root: FixtureNode;
};

function toSnapshotNode(n: FixtureNode): SnapshotNode {
  return {
    role: n.role,
    name: n.name ?? null,
    ref: n.ref ?? null,
    ...(n.level !== undefined ? { level: n.level } : {}),
    ...(n.enabled !== undefined ? { enabled: n.enabled } : {}),
    ...(n.inputType !== undefined ? { inputType: n.inputType } : {}),
    ...(n.autocomplete !== undefined ? { autocomplete: n.autocomplete } : {}),
    ...(n.attrName !== undefined ? { attrName: n.attrName } : {}),
    ...(n.attrId !== undefined ? { attrId: n.attrId } : {}),
    ...(n.placeholder !== undefined ? { placeholder: n.placeholder } : {}),
    ...(n.href !== undefined ? { href: n.href } : {}),
    children: (n.children ?? []).map(toSnapshotNode),
  };
}

function countInteractive(node: SnapshotNode): number {
  let count = node.ref !== null ? 1 : 0;
  for (const child of node.children) count += countInteractive(child);
  return count;
}

export function parseSnapshotFixture(text: string): AccessibilitySnapshot {
  const doc = parse(text) as FixtureDoc;
  const root = toSnapshotNode(doc.root);
  return {
    url: doc.url,
    title: doc.title,
    root,
    raw: {
      interactiveCount: countInteractive(root),
      domBytes: doc.raw?.domBytes ?? Buffer.byteLength(text, "utf8"),
    },
  };
}

export function loadSnapshotFixture(path: string): AccessibilitySnapshot {
  return parseSnapshotFixture(readFileSync(path, "utf8"));
}
