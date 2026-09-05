// packages/agents/explorer/src/playwright-driver.ts — the live half of BrowserDriver.
// Untested by design (a real browser is out of the unit tier): this is the smoke path
// behind `forge explore <url>`. Everything the eval harness asserts goes through
// `FakeDriver` instead — see 08 §6's "not raw DOM" / "not screenshots" reasoning for
// why interaction resolves through role + accessible name rather than a raw ref.
import type { Page } from "playwright";
import { SystemClock, type Clock, type ToolResult } from "@forge/core";
import { captureSnapshot, type AccessibilitySnapshot, type RawAffordance } from "@forge/perception";
import type { BrowserDriver, ExerciseAction } from "./driver.js";

const ARIA_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "checkbox",
  "radio",
  "combobox",
  "tab",
  "menuitem",
  "switch",
  "searchbox",
  "spinbutton",
]);

export class PlaywrightDriver implements BrowserDriver {
  constructor(
    private readonly page: Page,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  currentUrl(): string {
    return this.page.url();
  }

  async navigate(url: string): Promise<ToolResult<{ finalUrl: string; status: number }>> {
    try {
      const response = await this.page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 10_000,
      });
      return {
        ok: true,
        data: { finalUrl: this.page.url(), status: response?.status() ?? 0 },
        evidenceIds: [],
        durationMs: 0,
      };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: "NAVIGATION_FAILED",
          message: err instanceof Error ? err.message : String(err),
        },
        evidenceIds: [],
        durationMs: 0,
      };
    }
  }

  async observe(): Promise<ToolResult<{ snapshot: AccessibilitySnapshot }>> {
    const result = await captureSnapshot(this.page, this.clock);
    if (!result.ok) return result;
    return {
      ok: true,
      data: { snapshot: result.data },
      evidenceIds: [],
      durationMs: result.durationMs,
    };
  }

  async exercise(
    affordance: RawAffordance,
    value?: string,
  ): Promise<ToolResult<{ action: ExerciseAction }>> {
    if (affordance.destructive) {
      return {
        ok: false,
        error: {
          code: "ACTION_DENIED",
          message: `destructive affordance denied: ${affordance.accessibleName}`,
        },
        evidenceIds: [],
        durationMs: 0,
      };
    }
    try {
      const locator =
        affordance.accessibleName && ARIA_ROLES.has(affordance.role)
          ? this.page.getByRole(affordance.role as Parameters<Page["getByRole"]>[0], {
              name: affordance.accessibleName,
              exact: true,
            })
          : this.page.locator(`[role="${affordance.role}"]`);

      const count = await locator.count();
      if (count === 0) {
        return {
          ok: false,
          error: { code: "LOCATOR_NOT_FOUND", message: "resolved to 0 elements" },
          evidenceIds: [],
          durationMs: 0,
        };
      }
      if (count > 1) {
        return {
          ok: false,
          error: { code: "LOCATOR_AMBIGUOUS", message: "resolved to 2+ elements" },
          evidenceIds: [],
          durationMs: 0,
        };
      }

      if (affordance.kind === "textbox") {
        await locator.first().fill(value ?? "test");
        return { ok: true, data: { action: "fill" }, evidenceIds: [], durationMs: 0 };
      }
      if (affordance.kind === "select") {
        await locator
          .first()
          .selectOption({ index: 0 })
          .catch(() => undefined);
        return { ok: true, data: { action: "select" }, evidenceIds: [], durationMs: 0 };
      }
      await locator.first().click({ timeout: 5000 });
      return { ok: true, data: { action: "click" }, evidenceIds: [], durationMs: 0 };
    } catch (err) {
      return {
        ok: false,
        error: { code: "TIMEOUT", message: err instanceof Error ? err.message : String(err) },
        evidenceIds: [],
        durationMs: 0,
      };
    }
  }

  async back(): Promise<ToolResult<{ finalUrl: string }>> {
    await this.page.goBack();
    return { ok: true, data: { finalUrl: this.page.url() }, evidenceIds: [], durationMs: 0 };
  }
}
