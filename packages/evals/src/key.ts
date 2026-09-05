// packages/evals/src/key.ts — 16 §3.4: fixture key derivation, including `callIndex`.
// `callIndex` is not defensive padding: the Runner calls `snapshot()` twice from the
// same state during post-heal verification, and the two calls must return the
// pre-heal and post-heal pages — keying on arguments alone would replay the same
// recording both times.
import { createHash } from "node:crypto";

function roundFloats(value: unknown): unknown {
  if (typeof value === "number" && !Number.isInteger(value)) return Number(value.toFixed(6));
  if (Array.isArray(value)) return value.map(roundFloats);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, roundFloats(v)]),
    );
  }
  return value;
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) sorted[key] = sortKeysDeep(record[key]);
    return sorted;
  }
  return value;
}

/** Keys sorted, floats fixed to 6dp — 16 §3.4. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(roundFloats(value)));
}

export type KeyInput = {
  caseId: string;
  toolOrAgent: string;
  args: unknown;
  stateSignature?: string | null;
  callIndex: number;
};

export function deriveKey(input: KeyInput): string {
  const material = [
    input.caseId,
    input.toolOrAgent,
    canonicalJson(input.args),
    input.stateSignature ?? "",
    String(input.callIndex),
  ].join("|");
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}
