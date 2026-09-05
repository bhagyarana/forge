// packages/agents/explorer/src/frontier.test.ts — 09 §3.4: the frontier loop and its
// four halt reasons. EC-02's whole reason to exist: zero model calls, deterministic
// source, no browser.
import { describe, expect, it } from "vitest";
import { ManualClock, seededRunContext, type RunContext } from "@forge/core";
import type { AccessibilitySnapshot, SnapshotNode } from "@forge/perception";
import { FakeDriver, type FakeSiteNode } from "./fake-driver.js";
import { explore } from "./frontier.js";
import type { BatchDecision } from "./frontier.js";
import type { FrontierItem } from "./value.js";

function node(
  role: string,
  props: Partial<Omit<SnapshotNode, "role" | "children">> = {},
  children: SnapshotNode[] = [],
): SnapshotNode {
  return { role, name: null, ref: null, children, ...props };
}
function snap(url: string, root: SnapshotNode): AccessibilitySnapshot {
  return { url, title: url, root, raw: { interactiveCount: 0, domBytes: 0 } };
}

const ORIGIN = "https://x.test";
const HOME = `${ORIGIN}/`;
const PRODUCTS = `${ORIGIN}/products`;
const SKU1 = `${ORIGIN}/products/1`;
const SKU2 = `${ORIGIN}/products/2`;

/** A small, finite reference site: home → products → two SKUs, plus one deny-listed,
 * one off-origin and one disabled affordance that must never be exercised. */
function referenceSite(): Record<string, FakeSiteNode> {
  return {
    [HOME]: {
      snapshot: snap(
        HOME,
        node("document", {}, [
          node("banner", {}, [node("link", { name: "Shop", ref: "nav1" })]),
          node("main", {}, [
            node("link", { name: "Browse products", ref: "e1" }),
            node("link", { name: "External support", ref: "e2", href: "https://other.test/help" }),
            node("button", { name: "Delete everything", ref: "e3" }),
          ]),
        ]),
      ),
      edges: { e1: PRODUCTS, nav1: PRODUCTS },
    },
    [PRODUCTS]: {
      snapshot: snap(
        PRODUCTS,
        node("document", {}, [
          node("banner", {}, [node("link", { name: "Shop", ref: "nav1" })]),
          node("main", {}, [
            node("link", { name: "SKU 1", ref: "e1" }),
            node("link", { name: "SKU 2", ref: "e2" }),
            node("button", { name: "Notify me", ref: "e3", enabled: false }),
          ]),
        ]),
      ),
      edges: { e1: SKU1, e2: SKU2, nav1: HOME },
    },
    [SKU1]: {
      snapshot: snap(
        SKU1,
        node("document", {}, [
          node("banner", {}, [node("link", { name: "Shop", ref: "nav1" })]),
          node("main", {}, [node("heading", { name: "Widget", level: 1 })]),
        ]),
      ),
      edges: { nav1: HOME },
    },
    [SKU2]: {
      snapshot: snap(
        SKU2,
        node("document", {}, [
          node("banner", {}, [node("link", { name: "Shop", ref: "nav1" })]),
          node("main", {}, [node("heading", { name: "Gadget", level: 1 })]),
        ]),
      ),
      edges: { nav1: HOME },
    },
  };
}

function deps(ctx: RunContext, overrides: Partial<Parameters<typeof explore>[1]> = {}) {
  return {
    driver: new FakeDriver(referenceSite(), HOME),
    clock: ctx.clock,
    idGen: ctx.idGen,
    sessionId: "ses_1",
    ...overrides,
  };
}

describe("explore — the deterministic fallback (EC-02's whole reason to exist)", () => {
  it("discovers every reachable state, halts EXHAUSTED, makes zero model calls", async () => {
    const ctx = seededRunContext(1, "2026-01-01T00:00:00Z");
    const result = await explore({ url: HOME }, deps(ctx));

    expect(result.map.frontier.haltReason).toBe("EXHAUSTED");
    expect(result.modelCallsMade).toBe(0);
    expect(result.source).toBe("deterministic");
    expect(result.map.states.map((s) => s.url).sort()).toEqual([HOME, PRODUCTS, SKU1, SKU2].sort());
  });

  it("never exercises a destructive, off-origin or disabled affordance (I-20, FR-106, FR-109)", async () => {
    const ctx = seededRunContext(2, "2026-01-01T00:00:00Z");
    const driver = new FakeDriver(referenceSite(), HOME);
    const result = await explore({ url: HOME }, deps(ctx, { driver }));

    const byRefOnHome = (ref: string) =>
      driver.exercised.some((e) => e.url === HOME && e.ref === ref);
    expect(byRefOnHome("e3")).toBe(false); // Delete everything
    expect(byRefOnHome("e2")).toBe(false); // off-origin

    const deleteAff = result.affordances.find((a) => a.accessibleName === "Delete everything");
    expect(deleteAff?.destructive).toBe(true);
    expect(deleteAff?.observedNotExercised).toBe(true);
    expect(deleteAff?.notExercisedReason).toBe("DENY_LIST");

    const offOriginAff = result.affordances.find((a) => a.accessibleName === "External support");
    expect(offOriginAff?.observedNotExercised).toBe(true);
    expect(offOriginAff?.notExercisedReason).toBe("OFF_ORIGIN");

    const disabledAff = result.affordances.find((a) => a.accessibleName === "Notify me");
    expect(disabledAff?.observedNotExercised).toBe(true);
    expect(disabledAff?.notExercisedReason).toBe("DISABLED");
  });

  it("collapses the repeated global-nav link and still produces a ranked, non-empty backlog", async () => {
    const ctx = seededRunContext(3, "2026-01-01T00:00:00Z");
    const result = await explore({ url: HOME }, deps(ctx));
    expect(result.map.capabilities.length).toBeGreaterThan(0);
    expect(result.map.capabilities.map((c) => c.priorityRank)).toEqual(
      result.map.capabilities.map((_, i) => i),
    );
  });

  it("halts STATE_BUDGET when the state cap binds before the frontier empties", async () => {
    const ctx = seededRunContext(4, "2026-01-01T00:00:00Z");
    const result = await explore({ url: HOME, budget: { maxStates: 2 } }, deps(ctx));
    expect(result.map.frontier.haltReason).toBe("STATE_BUDGET");
    expect(result.map.states.length).toBeLessThanOrEqual(2);
  });

  it("halts TIME_BUDGET when the wall clock is already spent", async () => {
    const ctx = seededRunContext(5, "2026-01-01T00:00:00Z");
    const result = await explore({ url: HOME, budget: { wallClockMs: 0 } }, deps(ctx));
    expect(result.map.frontier.haltReason).toBe("TIME_BUDGET");
  });

  it("collapses /product/:sku variants into one state with visitedVariants incremented (08 §3.2)", async () => {
    const ctx = seededRunContext(9, "2026-01-01T00:00:00Z");
    const productPage = (sku: number) =>
      snap(
        `${ORIGIN}/products/${sku}`,
        node("document", {}, [
          node("banner", {}, [node("link", { name: "Shop", ref: "nav1" })]),
          node("main", {}, [node("heading", { name: `SKU ${sku}`, level: 1 })]),
        ]),
      );
    const site: Record<string, FakeSiteNode> = {
      [HOME]: {
        snapshot: snap(
          HOME,
          node("document", {}, [
            node("main", {}, [
              node("link", { name: "SKU one", ref: "e1" }),
              node("link", { name: "SKU two", ref: "e2" }),
            ]),
          ]),
        ),
        edges: { e1: `${ORIGIN}/products/1`, e2: `${ORIGIN}/products/2` },
      },
      [`${ORIGIN}/products/1`]: { snapshot: productPage(1), edges: { nav1: HOME } },
      [`${ORIGIN}/products/2`]: { snapshot: productPage(2), edges: { nav1: HOME } },
    };
    const result = await explore({ url: HOME }, deps(ctx, { driver: new FakeDriver(site, HOME) }));
    // 08 §3.2's worked example: same route template, digit-masked headings — one state.
    expect(result.map.states).toHaveLength(2); // home + the collapsed product state
    const product = result.map.states.find((s) => s.url !== HOME);
    expect(product?.visitedVariants).toBe(2);
  });

  it("terminates for a single-page site with no affordances at all (TG-2's degrade, upstream)", async () => {
    const ctx = seededRunContext(6, "2026-01-01T00:00:00Z");
    const site: Record<string, FakeSiteNode> = {
      [HOME]: {
        snapshot: snap(
          HOME,
          node("document", {}, [node("main", {}, [node("heading", { name: "Hi", level: 1 })])]),
        ),
      },
    };
    const result = await explore({ url: HOME }, deps(ctx, { driver: new FakeDriver(site, HOME) }));
    expect(result.map.frontier.haltReason).toBe("EXHAUSTED");
    expect(result.map.states).toHaveLength(1);
  });
});

describe("explore — the model path (call site 1)", () => {
  it("halts CALL_BUDGET when the model-turn ceiling binds, and counts calls made", async () => {
    const ctx = seededRunContext(7, "2026-01-01T00:00:00Z");
    let calls = 0;
    const alwaysLlm = async (batch: readonly FrontierItem[]): Promise<BatchDecision> => {
      calls += 1;
      return { chosen: batch.slice(0, 1), source: "llm" };
    };
    const result = await explore(
      { url: HOME, budget: { modelTurns: 1 } },
      deps(ctx, { chooseBatch: alwaysLlm }),
    );
    expect(result.source).toBe("llm");
    expect(result.modelCallsMade).toBe(1);
    expect(calls).toBe(1);
    expect(result.map.frontier.haltReason).toBe("CALL_BUDGET");
  });
});

describe("explore — ManualClock", () => {
  it("respects an externally-advanced clock for the wall-clock budget", async () => {
    const clock = new ManualClock("2026-01-01T00:00:00Z");
    const ctx = seededRunContext(8);
    const driver = new FakeDriver(referenceSite(), HOME);
    // Advance the clock past the budget before the loop's first check can run —
    // proves the budget is a real counter read from `ctx.clock`, not a fixed timeout.
    const originalNow = clock.now.bind(clock);
    let calls = 0;
    clock.now = () => {
      calls += 1;
      if (calls > 2) clock.advanceMs(100_000);
      return originalNow();
    };
    const result = await explore(
      { url: HOME, budget: { wallClockMs: 90_000 } },
      { driver, clock, idGen: ctx.idGen, sessionId: "ses_1" },
    );
    expect(result.map.frontier.haltReason).toBe("TIME_BUDGET");
  });
});
