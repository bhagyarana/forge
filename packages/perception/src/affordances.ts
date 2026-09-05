// packages/perception/src/affordances.ts — 08 §4: affordances, mechanical extraction
// plus the destructive deny-list. Pure and deterministic — "nothing about this step
// is a judgement, which is why it is code and not a call."
import type { Affordance, AffordanceKind, IdGen } from "@forge/core";
import type { AccessibilitySnapshot, SnapshotNode } from "./types.js";
import { interactiveNodes } from "./traverse.js";
import { isDestructive } from "./denylist.js";

function kindForRole(role: string, inputType?: string): AffordanceKind {
  if (inputType === "file") return "upload";
  switch (role) {
    case "button":
      return "button";
    case "link":
      return "link";
    case "textbox":
    case "searchbox":
    case "spinbutton":
      return "textbox";
    case "checkbox":
    case "switch":
      return "checkbox";
    case "radio":
      return "radio";
    case "combobox":
      return "select";
    case "tab":
      return "tab";
    case "menuitem":
      return "menuitem";
    default:
      return "other";
  }
}

/** One raw affordance per interactive node, before an id/stateId is minted for it. */
export type RawAffordance = Omit<Affordance, "id" | "stateId">;

function toRaw(node: SnapshotNode): RawAffordance {
  const destructive = isDestructive(node.name);
  return {
    ref: node.ref as string,
    role: node.role,
    accessibleName: node.name,
    kind: kindForRole(node.role, node.inputType),
    enabled: node.enabled ?? true,
    bbox: null,
    destructive,
    // I-20: a destructive affordance is recorded as not-exercised at the moment it
    // is discovered — it must never be exercised, so there is no later point at
    // which this flips from false to true.
    observedNotExercised: destructive,
    notExercisedReason: destructive ? "DENY_LIST" : null,
  };
}

/** Pure, deterministic, deny-list applied — 08 §4, 06 §5.1. */
export function rawAffordancesOf(snap: AccessibilitySnapshot): RawAffordance[] {
  return interactiveNodes(snap.root).map(toRaw);
}

/** Mints ids for a state's raw affordances — the one place `IdGen` enters this module. */
export function affordancesOf(
  snap: AccessibilitySnapshot,
  stateId: string,
  idGen: IdGen,
): Affordance[] {
  return rawAffordancesOf(snap).map((raw) => ({ ...raw, id: idGen.next("af"), stateId }));
}
