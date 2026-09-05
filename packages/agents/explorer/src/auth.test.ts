// packages/agents/explorer/src/auth.test.ts — 09 §2: authentication is deterministic
// first, and never throws — a target with no login form is a smaller map, not an error.
import { describe, expect, it } from "vitest";
import type { ToolResult } from "@forge/core";
import type { AccessibilitySnapshot, RawAffordance, SnapshotNode } from "@forge/perception";
import { authenticate, sameOrigin } from "./auth.js";
import type { BrowserDriver, ExerciseAction } from "./driver.js";

function node(
  role: string,
  props: Partial<Omit<SnapshotNode, "role" | "children">> = {},
  children: SnapshotNode[] = [],
): SnapshotNode {
  return { role, name: null, ref: null, children, ...props };
}
function snap(url: string, root: SnapshotNode): AccessibilitySnapshot {
  return { url, title: "Test", root, raw: { interactiveCount: 0, domBytes: 0 } };
}

const LOGIN_PAGE = snap(
  "https://x.test/login",
  node("form", {}, [
    node("textbox", { name: "Email", ref: "e1" }),
    node("textbox", { name: "Password", ref: "e2", inputType: "password" }),
    node("button", { name: "Sign in", ref: "e3" }),
  ]),
);

const DASHBOARD = snap(
  "https://x.test/dashboard",
  node("main", {}, [
    node("heading", { name: "Dashboard", level: 1 }),
    node("link", { name: "Sign out", ref: "e1" }),
  ]),
);

class ScriptedDriver implements BrowserDriver {
  private page: AccessibilitySnapshot;
  public filled: Array<{ ref: string; value?: string }> = [];
  public clicked: string[] = [];

  constructor(
    private readonly onSubmit: () => AccessibilitySnapshot,
    initial: AccessibilitySnapshot = LOGIN_PAGE,
  ) {
    this.page = initial;
  }

  currentUrl(): string {
    return this.page.url;
  }
  async navigate(): Promise<ToolResult<{ finalUrl: string; status: number }>> {
    return {
      ok: true,
      data: { finalUrl: this.page.url, status: 200 },
      evidenceIds: [],
      durationMs: 0,
    };
  }
  async observe(): Promise<ToolResult<{ snapshot: AccessibilitySnapshot }>> {
    return { ok: true, data: { snapshot: this.page }, evidenceIds: [], durationMs: 0 };
  }
  async exercise(
    affordance: RawAffordance,
    value?: string,
  ): Promise<ToolResult<{ action: ExerciseAction }>> {
    if (affordance.role === "textbox") {
      this.filled.push(
        value === undefined ? { ref: affordance.ref } : { ref: affordance.ref, value },
      );
      return { ok: true, data: { action: "fill" }, evidenceIds: [], durationMs: 0 };
    }
    this.clicked.push(affordance.ref);
    this.page = this.onSubmit();
    return { ok: true, data: { action: "click" }, evidenceIds: [], durationMs: 0 };
  }
  async back(): Promise<ToolResult<{ finalUrl: string }>> {
    return { ok: true, data: { finalUrl: this.page.url }, evidenceIds: [], durationMs: 0 };
  }
}

describe("sameOrigin", () => {
  it("compares origins, not full URLs", () => {
    expect(sameOrigin("https://x.test/a", "https://x.test/b")).toBe(true);
    expect(sameOrigin("https://x.test/a", "https://sso.example.com/consent")).toBe(false);
  });
});

describe("authenticate — the structural flow (09 §2)", () => {
  it("fills identity and password, clicks submit, and reports AUTHENTICATED", async () => {
    const driver = new ScriptedDriver(() => DASHBOARD);
    const result = await authenticate(driver, LOGIN_PAGE, {
      username: "alice",
      password: "hunter2",
    });

    expect(result.authenticated).toBe(true);
    expect(result.outcome).toBe("AUTHENTICATED");
    expect(driver.filled).toEqual([
      { ref: "e1", value: "alice" },
      { ref: "e2", value: "hunter2" },
    ]);
    expect(driver.clicked).toEqual(["e3"]);
  });

  it("reports NO_LOGIN_FORM_FOUND without touching the driver when there is no login form", async () => {
    const driver = new ScriptedDriver(() => DASHBOARD, DASHBOARD);
    const result = await authenticate(driver, DASHBOARD, {
      username: "alice",
      password: "hunter2",
    });
    expect(result.authenticated).toBe(false);
    expect(result.outcome).toBe("NO_LOGIN_FORM_FOUND");
    expect(driver.filled).toEqual([]);
  });

  it("reports NO_CREDENTIALS_SUPPLIED when a login form exists but no credentials were given", async () => {
    const driver = new ScriptedDriver(() => DASHBOARD);
    const result = await authenticate(driver, LOGIN_PAGE, undefined);
    expect(result.authenticated).toBe(false);
    expect(result.outcome).toBe("NO_CREDENTIALS_SUPPLIED");
    expect(driver.filled).toEqual([]);
  });

  it("retries once on CREDENTIALS_REJECTED, then gives up and reports it", async () => {
    const rejected = snap(
      "https://x.test/login",
      node("form", {}, [
        node("status", { name: "Invalid email or password" }),
        node("textbox", { name: "Email", ref: "e1" }),
        node("textbox", { name: "Password", ref: "e2", inputType: "password" }),
        node("button", { name: "Sign in", ref: "e3" }),
      ]),
    );
    const driver = new ScriptedDriver(() => rejected);
    const result = await authenticate(driver, LOGIN_PAGE, { username: "alice", password: "wrong" });
    expect(result.authenticated).toBe(false);
    expect(result.outcome).toBe("CREDENTIALS_REJECTED");
    // one attempt, one retry — two full fill/fill/click cycles.
    expect(driver.clicked).toEqual(["e3", "e3"]);
  });

  it("reports OUT_OF_SCOPE when submitting navigates off the target origin (SSO)", async () => {
    const sso = snap("https://sso.example.com/consent", node("main", {}, []));
    const driver = new ScriptedDriver(() => sso);
    const result = await authenticate(driver, LOGIN_PAGE, {
      username: "alice",
      password: "hunter2",
    });
    expect(result.authenticated).toBe(false);
    expect(result.outcome).toBe("OUT_OF_SCOPE");
  });
});
