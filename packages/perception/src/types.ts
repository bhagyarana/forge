// packages/perception/src/types.ts — 08 §2, §4: the perception primitive's shapes.
// Not Zod: an AccessibilitySnapshot is never persisted or serialised as one of the
// 05 §2 entities (it is captured, hashed and stored as content-addressed Evidence),
// so it has no schema to freeze — see 05-data-model.md §2.3's framing of State.

/** A snapshot-local handle, assigned by traversal order — 08 §2. Never a Playwright id. */
export type Ref = string;

/**
 * One node of the captured accessibility tree, plus the DOM facts perception needs
 * for login detection (input `type`, `autocomplete`, `name`/`id`, `placeholder`) and
 * off-origin scoping (a link's resolved `href`) that the ARIA tree alone does not
 * carry. A real capture assembles this by walking the accessibility tree and a
 * parallel `page.evaluate()` DOM pass, keyed by the same traversal order; a fixture
 * authors it directly in one YAML tree.
 */
export type SnapshotNode = {
  role: string;
  name: string | null;
  /** Present only on interactive nodes — 08 §2. */
  ref: Ref | null;
  /** Heading level, when role is "heading". */
  level?: number;
  enabled?: boolean;
  /** Input-shaped DOM facts, present only on form controls. */
  inputType?: string; // e.g. "password", "email", "checkbox", "submit"
  autocomplete?: string;
  attrName?: string; // the DOM `name` attribute
  attrId?: string;
  placeholder?: string;
  /** The browser-resolved absolute URL of a link — 09 §3.3's off-origin check. */
  href?: string;
  children: SnapshotNode[];
};

export type AccessibilitySnapshot = {
  url: string;
  title: string;
  root: SnapshotNode;
  /** The true, pre-truncation interactive count and raw byte size — 08 §2. */
  raw: { interactiveCount: number; domBytes: number };
};

export type LoginForm = {
  identityRef: Ref;
  passwordRef: Ref;
  submitRef: Ref;
  scopeRef: Ref | null;
  confidence: number;
};

export type AuthOutcome =
  | { verdict: "AUTHENTICATED" }
  | { verdict: "CREDENTIALS_REJECTED" }
  | { verdict: "NOTHING_HAPPENED" }
  | { verdict: "OUT_OF_SCOPE" };
