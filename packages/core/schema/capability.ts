// packages/core/schema/capability.ts — 05 §2.4: Capability and the map
import { z } from "zod";
import { Confidence, Id } from "./primitives.js";
import { State, Transition } from "./perception.js";

export const RiskFactors = z.object({
  authProximity: Confidence, // how close to the authenticated boundary
  dataMutation: Confidence, // does it write
  moneyOrPii: Confidence, // does it touch money or personal data
  graphCentrality: Confidence, // how many flows pass through it
  affordanceDensity: Confidence, // how much surface area
  statedIntent: Confidence, // did the user ask for it — FR-005
});
export type RiskFactors = z.infer<typeof RiskFactors>;

export const Capability = z.object({
  id: Id,
  sessionId: Id,
  name: z.string().min(2), // "Checkout" — user-meaningful, not a route
  description: z.string().min(10),
  entryStateId: Id,
  stateIds: z.array(Id).min(1),
  exitConditions: z.array(z.string()).min(1), // FR-105
  dependsOn: z.array(Id).default([]), // ADR-012 A1
  risk: z.object({ score: Confidence, factors: RiskFactors }),
  priorityRank: z.number().int().nonnegative(), // backlog order — deterministic
});
export type Capability = z.infer<typeof Capability>;

export const CapabilityMap = z.object({
  sessionId: Id,
  authenticated: z.boolean(),
  states: z.array(State),
  transitions: z.array(Transition),
  capabilities: z.array(Capability),
  apiHints: z // FR-110
    .array(
      z.object({
        method: z.string(),
        urlPattern: z.string(),
        seenInStateIds: z.array(Id),
      }),
    )
    .default([]),
  frontier: z.object({
    discovered: z.number().int(),
    explored: z.number().int(),
    haltReason: z.enum(["EXHAUSTED", "STATE_BUDGET", "TIME_BUDGET", "CALL_BUDGET"]),
  }), // FR-107
});
export type CapabilityMap = z.infer<typeof CapabilityMap>;
