// packages/agents/explorer/src/fake-driver.ts — an in-memory site graph implementing
// `BrowserDriver`, so `frontier.ts` can be exercised end to end with no browser and
// no model — the property EC-02 depends on. Test-only; not exported from index.ts.
import type { ToolResult } from "@forge/core";
import type { AccessibilitySnapshot, RawAffordance } from "@forge/perception";
import type { BrowserDriver, ExerciseAction } from "./driver.js";

export type FakeSiteNode = {
  snapshot: AccessibilitySnapshot;
  /** ref -> destination url. A ref with no entry is a click that goes nowhere. */
  edges?: Record<string, string>;
};

function ok<T>(data: T): ToolResult<T> {
  return { ok: true, data, evidenceIds: [], durationMs: 0 };
}
function err(
  code: "NAVIGATION_FAILED" | "ACTION_DENIED" | "INTERNAL",
  message: string,
): ToolResult<never> {
  return { ok: false, error: { code, message }, evidenceIds: [], durationMs: 0 };
}

function actionFor(affordance: RawAffordance): ExerciseAction {
  if (affordance.kind === "textbox") return "fill";
  if (affordance.kind === "select") return "select";
  return "click";
}

export class FakeDriver implements BrowserDriver {
  private readonly site: Map<string, FakeSiteNode>;
  private current: string;
  public readonly exercised: Array<{ url: string; ref: string }> = [];

  constructor(site: Record<string, FakeSiteNode>, entryUrl: string) {
    this.site = new Map(Object.entries(site));
    this.current = entryUrl;
  }

  currentUrl(): string {
    return this.current;
  }

  async navigate(url: string): Promise<ToolResult<{ finalUrl: string; status: number }>> {
    if (!this.site.has(url)) return err("NAVIGATION_FAILED", `no such fixture page: ${url}`);
    this.current = url;
    return ok({ finalUrl: url, status: 200 });
  }

  async observe(): Promise<ToolResult<{ snapshot: AccessibilitySnapshot }>> {
    const node = this.site.get(this.current);
    if (!node) return err("INTERNAL", `no fixture page registered at ${this.current}`);
    return ok({ snapshot: node.snapshot });
  }

  async exercise(affordance: RawAffordance): Promise<ToolResult<{ action: ExerciseAction }>> {
    if (affordance.destructive)
      return err("ACTION_DENIED", `destructive: ${affordance.accessibleName}`);
    this.exercised.push({ url: this.current, ref: affordance.ref });
    const node = this.site.get(this.current);
    const dest = node?.edges?.[affordance.ref];
    if (dest) this.current = dest;
    return ok({ action: actionFor(affordance) });
  }

  async back(): Promise<ToolResult<{ finalUrl: string }>> {
    return ok({ finalUrl: this.current });
  }
}
