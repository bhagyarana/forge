// packages/perception/src/signature.ts — 08 §3: the state signature. Pure, no
// browser, no model — the property that lets EC-02 assert exploration deterministically
// with the key unset. FR-108.
import { createHash } from "node:crypto";
import type { AccessibilitySnapshot, SnapshotNode } from "./types.js";
import { isInteractiveRole } from "./traverse.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_RE = /^\d+$/;

const LANDMARK_ROLES = new Set([
  "banner",
  "navigation",
  "main",
  "contentinfo",
  "complementary",
  "search",
  "region",
]);

/** Roles whose accessible name is structurally meaningful and survives into the
 * skeleton (08 §3.1 step 2). Everything else keeps its role but drops its name —
 * body copy, prices and item names are exactly what step 2 discards. */
const NAME_BEARING_ROLES = new Set([
  "heading",
  "form",
  "group",
  "dialog",
  "tabpanel",
  "table",
  ...LANDMARK_ROLES,
]);

/** Pure text/media content — dropped from the skeleton entirely, subtree and all. */
const CONTENT_ROLES = new Set(["text", "statictext", "paragraph", "img", "time", "separator"]);

/**
 * The path becomes a route template; numeric and UUID-shaped segments become
 * placeholders (08 §3.1 step 1). Query strings are deliberately excluded from the
 * signature — they are presentational (sort, page, filter) rather than structural,
 * which is what makes the `/products?page=1` vs `?page=2` vs `?page=1&sort=price`
 * worked example (08 §3.2) collapse to one state despite three different query
 * strings. `09 §5.1`'s clustering pass, which merges on "first route-template
 * segment", uses this same path-only template.
 */
export function routeTemplate(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  const segments = url.pathname
    .split("/")
    .map((seg) => (seg.length > 0 && (NUMERIC_RE.test(seg) || UUID_RE.test(seg)) ? ":id" : seg));
  return segments.join("/") || "/";
}

function maskDigits(name: string): string {
  return name.replace(/\d+/g, "#");
}

type CanonicalNode = {
  role: string;
  name: string | null;
  repeat: number;
  children: CanonicalNode[];
};

function shapeKey(n: CanonicalNode): string {
  return JSON.stringify([n.role, n.name, n.children.map(shapeKey)]);
}

function collapseRepeats(children: CanonicalNode[]): CanonicalNode[] {
  const collapsed: CanonicalNode[] = [];
  for (const child of children) {
    const prev = collapsed[collapsed.length - 1];
    if (
      prev &&
      prev.repeat === child.repeat &&
      shapeKey({ ...prev, repeat: 1 }) === shapeKey({ ...child, repeat: 1 })
    ) {
      prev.repeat += 1;
    } else {
      collapsed.push({ ...child });
    }
  }
  return collapsed;
}

function canonicalize(node: SnapshotNode): CanonicalNode | null {
  if (CONTENT_ROLES.has(node.role.toLowerCase())) return null;

  const children = collapseRepeats(
    node.children.map(canonicalize).filter((c): c is CanonicalNode => c !== null),
  );

  return {
    role: node.role,
    name:
      NAME_BEARING_ROLES.has(node.role) || isInteractiveRole(node.role)
        ? node.name
          ? maskDigits(node.name)
          : null
        : null,
    repeat: 1,
    children,
  };
}

/** The ordered role tree the signature hashes — exposed for tests and diagnostics.
 * Carries `repeat` counts for inspection; the hash itself ignores them (see
 * `hashableShape` below) so a 49-item list and a 50-item list of the same shape
 * still collapse to one state — "recall of sameness" (08 §3.3). */
export function canonicalSkeleton(snap: AccessibilitySnapshot): unknown {
  return canonicalize(snap.root) ?? { role: snap.root.role, name: null, repeat: 1, children: [] };
}

function hashableShape(n: CanonicalNode): unknown {
  return { role: n.role, name: n.name, children: n.children.map(hashableShape) };
}

/** Pure · 16 hex chars · FR-108. Two pages with the same signature are the same state. */
export function stateSignature(snap: AccessibilitySnapshot): string {
  const skeleton = canonicalize(snap.root) ?? {
    role: snap.root.role,
    name: null,
    repeat: 1,
    children: [],
  };
  const input = `${routeTemplate(snap.url)}\n${JSON.stringify(hashableShape(skeleton))}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}
