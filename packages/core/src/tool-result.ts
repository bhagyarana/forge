// packages/core/src/tool-result.ts — 06 §1: the no-throw law. Every tool in FORGE
// returns this shape; nothing in runner/perception/agents-tools throws across a stage
// boundary. Plain types, not Zod: this is an in-process contract, never persisted or
// serialised as-is (it is not one of the 05 §2 entities), so it has no schema to freeze.
export type ToolErrorCode =
  | "LOCATOR_NOT_FOUND" // resolved to 0 elements
  | "LOCATOR_AMBIGUOUS" // resolved to 2+ elements — never acted on
  | "ASSERTION_FAILED" // element found, claim false — the PRODUCT_BUG signal
  | "TIMEOUT"
  | "NAVIGATION_FAILED"
  | "TARGET_UNREACHABLE" // the ENVIRONMENT signal
  | "ELEMENT_NOT_INTERACTABLE"
  | "ACTION_DENIED" // blocked by the destructive deny-list — FR-106
  | "OFF_ORIGIN" // navigation left the target origin — FR-109
  | "BUDGET_EXHAUSTED" // a ceiling was reached; partial data is still returned
  | "SCRIPT_ERROR"
  | "INTERNAL";

export type ToolError = {
  code: ToolErrorCode;
  message: string;
  detail?: Record<string, unknown>;
};

export type ToolResult<T> =
  | { ok: true; data: T; evidenceIds: string[]; durationMs: number }
  | { ok: false; error: ToolError; evidenceIds: string[]; durationMs: number };
