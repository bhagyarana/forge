// packages/core/schema/perception.ts — 05 §2.3: State, Affordance, Transition
import { z } from "zod";
import { BBox, Id, Iso } from "./primitives.js";

export const AffordanceKind = z.enum([
  "button",
  "link",
  "textbox",
  "checkbox",
  "radio",
  "select",
  "tab",
  "menuitem",
  "form",
  "upload",
  "other",
]);
export type AffordanceKind = z.infer<typeof AffordanceKind>;

export const Affordance = z.object({
  id: Id,
  stateId: Id,
  ref: z.string(), // snapshot-local handle, e.g. "e42"
  role: z.string(), // ARIA role
  accessibleName: z.string().nullable(),
  kind: AffordanceKind,
  enabled: z.boolean().default(true),
  bbox: BBox.nullable(),
  /** Matched the destructive-verb deny-list. Recorded, never pressed. FR-106 */
  destructive: z.boolean().default(false),
  /** Seen but deliberately not exercised — deny-listed, budget-capped, or off-origin. */
  observedNotExercised: z.boolean().default(false),
  notExercisedReason: z.string().nullable().default(null),
});
export type Affordance = z.infer<typeof Affordance>;

export const State = z.object({
  id: Id,
  sessionId: Id,
  /** Structural hash. Two pages with the same signature are the same state. FR-108 */
  signature: z.string().length(16),
  url: z.string(),
  title: z.string(),
  authRequired: z.boolean().default(false),
  snapshotEvidenceId: Id, // the accessibility snapshot, content-addressed
  affordanceIds: z.array(Id),
  /** How many raw pages collapsed into this state — a 50-page list is one state. */
  visitedVariants: z.number().int().positive().default(1),
  discoveredAt: Iso,
});
export type State = z.infer<typeof State>;

export const Transition = z.object({
  id: Id,
  sessionId: Id,
  fromStateId: Id,
  toStateId: Id,
  viaAffordanceId: Id,
  action: z.enum(["click", "fill", "select", "navigate", "back", "submit"]),
  observedAt: Iso,
});
export type Transition = z.infer<typeof Transition>;
