// packages/perception/src/login.ts — 09 §2: authentication is deterministic first.
// FR-101, FR-102, FR-003. The model is consulted only when this returns null AND the
// page still looks like a gate — that fallback lives in the Explorer, not here.
import type { AccessibilitySnapshot, AuthOutcome, LoginForm, SnapshotNode } from "./types.js";
import { stateSignature } from "./signature.js";

const IDENTITY_RE = /user|e-?mail|login|phone|mobile|account|employee|member/i;
const SUBMIT_NAME_RE = /sign ?in|log ?in|continue|submit|enter/i;
const SIGNOUT_RE = /sign ?out|log ?out|my account|profile/i;

const LANDMARK_ROLES = new Set([
  "banner",
  "navigation",
  "main",
  "contentinfo",
  "complementary",
  "search",
  "region",
]);

type FlatItem = {
  node: SnapshotNode;
  order: number;
  formScope: SnapshotNode | null;
  landmarkScope: SnapshotNode | null;
};

function flatten(root: SnapshotNode): FlatItem[] {
  const items: FlatItem[] = [];
  let order = 0;
  function visit(
    node: SnapshotNode,
    formScope: SnapshotNode | null,
    landmarkScope: SnapshotNode | null,
  ): void {
    const nextForm = node.role === "form" ? node : formScope;
    const nextLandmark = LANDMARK_ROLES.has(node.role) ? node : landmarkScope;
    items.push({ node, order: order++, formScope: nextForm, landmarkScope: nextLandmark });
    for (const child of node.children) visit(child, nextForm, nextLandmark);
  }
  visit(root, null, null);
  return items;
}

function matchesIdentity(node: SnapshotNode): boolean {
  const candidates = [node.autocomplete, node.attrName, node.attrId, node.name, node.placeholder];
  return candidates.some((c) => c && IDENTITY_RE.test(c));
}

function scopeRef(scope: SnapshotNode | null, order: number, kind: "form"): string | null {
  if (!scope) return null;
  return scope.ref ?? `${kind}@${order}`;
}

/** Three signals, evaluated in order — 09 §2.1. Pure, no model, no browser. */
export function detectLoginForm(snap: AccessibilitySnapshot): LoginForm | null {
  const items = flatten(snap.root);

  const passwordItems = items.filter((i) => i.node.inputType === "password");
  if (passwordItems.length !== 1) return null; // 0: no gate. 2+: registration/change-password.
  const passwordItem = passwordItems[0]!;

  const precedingTextboxes = items.filter(
    (i) =>
      i.order < passwordItem.order && (i.node.role === "textbox" || i.node.role === "searchbox"),
  );
  if (precedingTextboxes.length === 0) return null; // identity signal missing
  const matched = [...precedingTextboxes].reverse().find((i) => matchesIdentity(i.node));
  const identityItem = matched ?? precedingTextboxes[precedingTextboxes.length - 1]!;

  const inSameForm = items.filter(
    (i) =>
      i.formScope === passwordItem.formScope &&
      passwordItem.formScope !== null &&
      (i.node.role === "button" || i.node.inputType === "submit"),
  );
  const inSameLandmark = items.filter(
    (i) =>
      i.landmarkScope === passwordItem.landmarkScope &&
      passwordItem.landmarkScope !== null &&
      i.node.role === "button" &&
      (i.node.enabled ?? true),
  );
  const byName = items.filter(
    (i) => i.node.role === "button" && i.node.name && SUBMIT_NAME_RE.test(i.node.name),
  );

  let submitItem: FlatItem | null = null;
  if (inSameForm.length > 0) submitItem = inSameForm[0]!;
  else if (inSameLandmark.length === 1) submitItem = inSameLandmark[0]!;
  else if (byName.length > 0) submitItem = byName[0]!;
  if (!submitItem) return null; // submit signal missing

  const sameForm =
    passwordItem.formScope !== null &&
    identityItem.formScope === passwordItem.formScope &&
    submitItem.formScope === passwordItem.formScope;
  const sameLandmark =
    passwordItem.landmarkScope !== null &&
    identityItem.landmarkScope === passwordItem.landmarkScope &&
    submitItem.landmarkScope === passwordItem.landmarkScope;

  const confidence = sameForm ? 1.0 : sameLandmark ? 0.8 : 0.6;

  return {
    identityRef: identityItem.node.ref ?? `field@${identityItem.order}`,
    passwordRef: passwordItem.node.ref ?? `field@${passwordItem.order}`,
    submitRef: submitItem.node.ref ?? `field@${submitItem.order}`,
    scopeRef: scopeRef(passwordItem.formScope, passwordItem.order, "form"),
    confidence,
  };
}

function hasPasswordField(snap: AccessibilitySnapshot): boolean {
  return flatten(snap.root).some((i) => i.node.inputType === "password");
}

function hasMatchingAffordance(snap: AccessibilitySnapshot, re: RegExp): boolean {
  return flatten(snap.root).some(
    (i) =>
      (i.node.role === "link" || i.node.role === "button") && i.node.name && re.test(i.node.name),
  );
}

/**
 * The structural verdict — 09 §2.2. Naive crawlers get this wrong by checking page
 * text; this checks the shape of the page instead.
 */
export function authOutcome(
  before: AccessibilitySnapshot,
  after: AccessibilitySnapshot,
  opts: { navigatedOffOrigin?: boolean } = {},
): AuthOutcome {
  if (opts.navigatedOffOrigin) return { verdict: "OUT_OF_SCOPE" };
  if (stateSignature(before) === stateSignature(after)) return { verdict: "NOTHING_HAPPENED" };
  if (!hasPasswordField(after) || hasMatchingAffordance(after, SIGNOUT_RE)) {
    return { verdict: "AUTHENTICATED" };
  }
  return { verdict: "CREDENTIALS_REJECTED" };
}
