// packages/agents/explorer/src/driver.ts — the seam between the deterministic
// frontier loop and a real browser (06 §5.1, §5.2). `PlaywrightDriver` implements
// this against a live page; a `FakeDriver` implements it against an in-memory site
// graph for tests — same loop, same signatures, no browser in CI.
import type { ToolResult } from "@forge/core";
import type { AccessibilitySnapshot, RawAffordance } from "@forge/perception";

export type ExerciseAction = "click" | "fill" | "select" | "back" | "submit";

export interface BrowserDriver {
  navigate(url: string): Promise<ToolResult<{ finalUrl: string; status: number }>>;
  observe(): Promise<ToolResult<{ snapshot: AccessibilitySnapshot }>>;
  /** Clicks (or, for a textbox, fills with a placeholder value) the given affordance. */
  exercise(
    affordance: RawAffordance,
    value?: string,
  ): Promise<ToolResult<{ action: ExerciseAction }>>;
  back(): Promise<ToolResult<{ finalUrl: string }>>;
  currentUrl(): string;
}
