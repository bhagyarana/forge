// packages/store/src/redact.ts — FR-507, I-16: evidence and event payloads are redacted
// before persistence. `authorization`, `cookie`, `set-cookie`, and key-shaped strings
// are stripped structurally; a literal secret (e.g. a session password) is stripped by value.
const SENSITIVE_HEADER_KEYS = new Set(["authorization", "cookie", "set-cookie"]);
const KEY_SHAPED_PATTERN = /^(sk|pk|api|token)[-_][A-Za-z0-9]{12,}$/i;
export const REDACTED = "[REDACTED]";

export function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return KEY_SHAPED_PATTERN.test(value) ? REDACTED : value;
  }
  if (Array.isArray(value)) return value.map(redactValue);
  if (value !== null && typeof value === "object") {
    return redactObject(value as Record<string, unknown>);
  }
  return value;
}

function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    out[key] = SENSITIVE_HEADER_KEYS.has(key.toLowerCase()) ? REDACTED : redactValue(val);
  }
  return out;
}

/** Redacts a known literal secret wherever it appears in a JSON-serialisable value. */
export function redactSecret<T>(value: T, secret: string | undefined | null): T {
  if (!secret) return value;
  const json = JSON.stringify(value).split(secret).join(REDACTED);
  return JSON.parse(json) as T;
}

/** Composition used by the store before any write — 04 §8 clause 7. */
export function redact<T>(value: T, secret?: string | null): T {
  return redactSecret(redactValue(value), secret) as T;
}
