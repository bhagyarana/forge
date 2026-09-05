// packages/core/schema/session.ts — 05 §2.2: the only required input is a URL
import { z } from "zod";
import { Id, Iso } from "./primitives.js";

export const SessionMode = z.enum(["autopilot", "copilot"]);
export type SessionMode = z.infer<typeof SessionMode>;

export const SessionInput = z.object({
  url: z.string().url(), // FR-001 — the ONLY required field
  username: z.string().optional(),
  password: z.string().optional(), // never persisted — FR-006
  prd: z.string().max(200_000).optional(), // FR-004
  intent: z.string().max(2_000).optional(), // FR-005
  mode: SessionMode.default("autopilot"), // FR-007
  budget: z // FR-008
    .object({
      maxCapabilities: z.number().int().positive().default(20),
      maxDurationMs: z
        .number()
        .int()
        .positive()
        .default(30 * 60_000),
      maxUsd: z.number().positive().default(2.0),
    })
    .default({}),
});
export type SessionInput = z.infer<typeof SessionInput>;

export const SessionStatus = z.enum([
  "CREATED",
  "EXPLORING",
  "PRIORITISING",
  "LAPPING",
  "REPORTING",
  "COMPLETED",
  "COMPLETED_PARTIAL",
  "ESCALATED",
  "ERROR", // FR-904
]);
export type SessionStatus = z.infer<typeof SessionStatus>;

export const Session = z.object({
  id: Id,
  input: SessionInput.omit({ password: true }), // the password never reaches this object
  status: SessionStatus,
  authenticated: z.boolean().default(false),
  storageStatePath: z.string().nullable().default(null),
  exitCode: z.number().int().min(0).max(3).nullable(),
  defectsFound: z.number().int().nonnegative().default(0),
  createdAt: Iso,
  finishedAt: Iso.nullable(),
  usage: z
    .object({
      inputTokens: z.number().int(),
      outputTokens: z.number().int(),
      cacheReadTokens: z.number().int(),
      calls: z.number().int(),
      estimatedUsd: z.number(),
    })
    .nullable(),
});
export type Session = z.infer<typeof Session>;

/** The type `Session.input` is required to have — password is structurally absent. */
export type SessionInputPublic = z.infer<typeof Session>["input"];
