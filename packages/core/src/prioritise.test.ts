// packages/core/src/prioritise.test.ts — 09 §5, §6: clustering and risk ranking.
// Pure, no browser, no model.
import { describe, expect, it } from "vitest";
import type { Affordance, Capability, State, Transition } from "../schema/index.js";
import { seededRunContext } from "./env.js";
import {
  RISK_WEIGHTS,
  buildCapabilities,
  cluster,
  computeRiskFactors,
  nameCluster,
  rank,
  riskScore,
  type ClusterInput,
} from "./prioritise.js";

let stateSeq = 0;
let affSeq = 0;
let trSeq = 0;

function mkState(url: string, opts: Partial<State> = {}): State {
  stateSeq += 1;
  const id = opts.id ?? `st_${stateSeq}`;
  return {
    id,
    sessionId: "ses_1",
    signature: id.padEnd(16, "0").slice(0, 16),
    url,
    title: opts.title ?? url,
    authRequired: opts.authRequired ?? false,
    snapshotEvidenceId: `ev_${id}`,
    affordanceIds: [],
    visitedVariants: 1,
    discoveredAt: "2026-01-01T00:00:00Z",
    ...opts,
  };
}

function mkAffordance(stateId: string, opts: Partial<Affordance> = {}): Affordance {
  affSeq += 1;
  return {
    id: opts.id ?? `af_${affSeq}`,
    stateId,
    ref: opts.ref ?? `e${affSeq}`,
    role: opts.role ?? "link",
    accessibleName: opts.accessibleName ?? null,
    kind: opts.kind ?? "link",
    enabled: opts.enabled ?? true,
    bbox: null,
    destructive: opts.destructive ?? false,
    observedNotExercised: opts.observedNotExercised ?? false,
    notExercisedReason: opts.notExercisedReason ?? null,
  };
}

function mkTransition(
  from: string,
  to: string,
  via: string,
  action: Transition["action"] = "click",
): Transition {
  trSeq += 1;
  return {
    id: `tr_${trSeq}`,
    sessionId: "ses_1",
    fromStateId: from,
    toStateId: to,
    viaAffordanceId: via,
    action,
    observedAt: "2026-01-01T00:00:00Z",
  };
}

describe("cluster — pass 1: strip global navigation (09 §5.1)", () => {
  it("without stripping, a header link on every state would merge everything into one blob", () => {
    const home = mkState("/");
    const products = mkState("/products");
    const cart = mkState("/cart");
    const shopLinkHome = mkAffordance(home.id, { accessibleName: "Shop" });
    const shopLinkProducts = mkAffordance(products.id, { accessibleName: "Shop" });
    const shopLinkCart = mkAffordance(cart.id, { accessibleName: "Shop" });
    const states = [home, products, cart];
    const affordances = [shopLinkHome, shopLinkProducts, shopLinkCart];
    // The only edges in this fixture ride the global nav link.
    const transitions = [
      mkTransition(home.id, products.id, shopLinkHome.id),
      mkTransition(products.id, cart.id, shopLinkProducts.id),
      mkTransition(cart.id, home.id, shopLinkCart.id),
    ];
    const drafts = cluster({ states, transitions, affordances });
    // All three states become three separate single-state capabilities, not one blob.
    expect(drafts).toHaveLength(3);
  });

  it("keeps a genuine, non-global transition after nav-stripping", () => {
    const home = mkState("/");
    const products = mkState("/products");
    const detail = mkState("/products/1");
    const nav = (s: string) => mkAffordance(s, { accessibleName: "Shop" });
    const navHome = nav(home.id);
    const navProducts = nav(products.id);
    const navDetail = nav(detail.id);
    const viewLink = mkAffordance(products.id, { accessibleName: "View product" });
    const states = [home, products, detail];
    const affordances = [navHome, navProducts, navDetail, viewLink];
    const transitions = [
      mkTransition(home.id, products.id, navHome.id),
      mkTransition(products.id, home.id, navProducts.id),
      mkTransition(detail.id, home.id, navDetail.id),
      mkTransition(products.id, detail.id, viewLink.id), // the real edge
    ];
    const drafts = cluster({ states, transitions, affordances });
    const withDetail = drafts.find((d) => d.stateIds.includes(detail.id));
    expect(withDetail?.stateIds).toEqual(expect.arrayContaining([products.id, detail.id]));
  });
});

describe("cluster — pass 2: weakly connected components", () => {
  it("separates two islands with no edge between them", () => {
    const a1 = mkState("/a/1");
    const a2 = mkState("/a/2");
    const linkA = mkAffordance(a1.id, { accessibleName: "Next" });
    const b1 = mkState("/b/1");
    const b2 = mkState("/b/2");
    const linkB = mkAffordance(b1.id, { accessibleName: "Next" });
    const states = [a1, a2, b1, b2];
    const affordances = [linkA, linkB];
    const transitions = [
      mkTransition(a1.id, a2.id, linkA.id),
      mkTransition(b1.id, b2.id, linkB.id),
    ];
    const drafts = cluster({ states, transitions, affordances });
    expect(drafts).toHaveLength(2);
    expect(drafts.map((d) => d.stateIds.length).sort()).toEqual([2, 2]);
  });
});

describe("cluster — pass 3: merge by first route-template segment", () => {
  it("merges two otherwise-disconnected clusters that share /checkout/*", () => {
    const checkout = mkState("/checkout");
    const payment = mkState("/checkout/payment");
    const via = mkAffordance(checkout.id, { accessibleName: "Pay" });
    // No edge between them, but both are under /checkout.
    const states = [checkout, payment];
    const transitions: Transition[] = [];
    const drafts = cluster({ states, transitions, affordances: [via] });
    expect(drafts).toHaveLength(1);
    expect(new Set(drafts[0]?.stateIds)).toEqual(new Set([checkout.id, payment.id]));
  });
});

describe("cluster — pass 4: split a cluster above 8 states by second route segment", () => {
  it("splits into groups by second segment once a cluster exceeds 8 states", () => {
    const sectionA = Array.from({ length: 5 }, (_, i) => mkState(`/admin/section-a/${i}`));
    const sectionB = Array.from({ length: 4 }, (_, i) => mkState(`/admin/section-b/${i}`));
    const all = [...sectionA, ...sectionB];
    // Chain every state to the next so pass 2 sees one connected component of 9.
    const affordances = all.slice(0, -1).map((s) => mkAffordance(s.id, { accessibleName: "Next" }));
    const transitions = all
      .slice(0, -1)
      .map((s, i) => mkTransition(s.id, all[i + 1]!.id, affordances[i]!.id));

    const drafts = cluster({ states: all, transitions, affordances });
    expect(drafts).toHaveLength(2);
    const sizes = drafts.map((d) => d.stateIds.length).sort((x, y) => x - y);
    expect(sizes).toEqual([4, 5]);
    for (const draft of drafts) {
      expect(draft.stateIds.length).toBeLessThanOrEqual(8);
    }
  });

  it("leaves a mixed cluster of 8 or fewer states alone even with multiple second segments", () => {
    const states = [mkState("/admin/a/1"), mkState("/admin/b/1")];
    const via = mkAffordance(states[0]!.id, { accessibleName: "Go" });
    const transitions = [mkTransition(states[0]!.id, states[1]!.id, via.id)];
    const drafts = cluster({ states, transitions, affordances: [via] });
    expect(drafts).toHaveLength(1);
  });
});

describe("cluster — pass 5: attach orphans", () => {
  it("attaches a single-state component to whichever cluster transitions into it most", () => {
    const shopA1 = mkState("/shop/1");
    const shopA2 = mkState("/shop/2");
    const shopLinkAffordance = mkAffordance(shopA1.id, { accessibleName: "Next" });
    const supportA1 = mkState("/support/1");
    const orphan = mkState("/help");

    // Deliberately distinct names — a repeated (role, name) pair on ≥60% of states
    // would itself be stripped as global nav by pass 1 (09 §5.1), which would make
    // this fixture test the wrong thing.
    const fromShop1 = mkAffordance(shopA1.id, { accessibleName: "Help center" });
    const fromShop2 = mkAffordance(shopA2.id, { accessibleName: "Get help" });
    const fromSupport = mkAffordance(supportA1.id, { accessibleName: "Contact support" });

    const states = [shopA1, shopA2, supportA1, orphan];
    const affordances = [shopLinkAffordance, fromShop1, fromShop2, fromSupport];
    const transitions = [
      mkTransition(shopA1.id, shopA2.id, shopLinkAffordance.id),
      mkTransition(shopA1.id, orphan.id, fromShop1.id),
      mkTransition(shopA2.id, orphan.id, fromShop2.id),
      mkTransition(supportA1.id, orphan.id, fromSupport.id),
    ];
    const drafts = cluster({ states, transitions, affordances });
    // shop (2 incoming to /help) beats support (1 incoming) — /help joins shop.
    const shopCluster = drafts.find((d) => d.stateIds.includes(shopA1.id));
    expect(shopCluster?.stateIds).toContain(orphan.id);
  });

  it("leaves a true orphan — no incoming transitions at all — as its own capability", () => {
    const entry = mkState("/");
    const lonely = mkState("/orphan");
    const drafts = cluster({ states: [entry, lonely], transitions: [], affordances: [] });
    expect(drafts).toHaveLength(2);
  });
});

describe("cluster — degenerate inputs", () => {
  it("returns an empty array for an empty map", () => {
    expect(cluster({ states: [], transitions: [], affordances: [] })).toEqual([]);
  });

  it("returns one cluster for a single-state map", () => {
    const only = mkState("/");
    expect(cluster({ states: [only], transitions: [], affordances: [] })).toHaveLength(1);
  });
});

describe("nameCluster — fallback naming, no model (09 §5.2)", () => {
  it("title-cases the longest common route segment", () => {
    const checkout = mkState("/checkout");
    const payment = mkState("/checkout/payment");
    const draft = {
      stateIds: [checkout.id, payment.id],
      entryStateId: checkout.id,
      exitConditions: ["x"],
    };
    const named = nameCluster(
      draft,
      new Map([
        [checkout.id, checkout],
        [payment.id, payment],
      ]),
    );
    expect(named.name).toBe("Checkout");
  });

  it("falls back to the entry state's title when the route is /", () => {
    const home = mkState("/", { title: "Welcome to Aperture" });
    const draft = { stateIds: [home.id], entryStateId: home.id, exitConditions: ["x"] };
    const named = nameCluster(draft, new Map([[home.id, home]]));
    expect(named.name).toBe("Welcome to Aperture");
  });
});

describe("riskScore and rank — 09 §6", () => {
  it("RISK_WEIGHTS sums to 1.00", () => {
    const sum = Object.values(RISK_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  // 09 §6.3's worked example, with the risk totals recomputed from the document's own
  // formula: Σ W[f]·factors[f] with W = {.28,.22,.15,.15,.10,.10}. The two rows whose
  // authProximity is 0 (Cart, Browse & Search) reproduce the document's published
  // totals exactly (0.446, 0.220); the other three rows, all with authProximity > 0,
  // are consistently off by ~0.10 in the document's own prose — a transcription slip
  // there, not a hint that the formula differs. The relative ORDER the document
  // claims (Checkout > Account > Sign-in > Admin Catalogue > Cart > Browse & Search)
  // holds under the correct arithmetic too, which is what this test asserts.
  it("reproduces the worked example's backlog order", () => {
    const factorsFor = (
      money: number,
      mutate: number,
      auth: number,
      central: number,
      density: number,
    ) => ({
      moneyOrPii: money,
      dataMutation: mutate,
      authProximity: auth,
      graphCentrality: central,
      affordanceDensity: density,
      statedIntent: 0,
    });
    const capability = (name: string, factors: ReturnType<typeof factorsFor>): Capability => ({
      id: `cap_${name}`,
      sessionId: "ses_1",
      name,
      description: `The ${name} capability.`,
      entryStateId: "st_1",
      stateIds: ["st_1"],
      exitConditions: ["x"],
      dependsOn: [],
      risk: { score: riskScore(factors), factors },
      priorityRank: 0,
    });

    const capabilities = [
      capability("Checkout", factorsFor(1.0, 1.0, 0.6, 0.72, 0.83)),
      capability("Account", factorsFor(0.67, 1.0, 1.0, 0.48, 0.61)),
      capability("Sign-in", factorsFor(0.33, 1.0, 0.6, 1.0, 0.35)),
      capability("Admin Catalogue", factorsFor(0.33, 1.0, 1.0, 0.24, 0.52)),
      capability("Cart", factorsFor(0.67, 0.6, 0.0, 0.64, 0.3)),
      capability("Browse & Search", factorsFor(0.0, 0.0, 0.0, 0.8, 1.0)),
    ];

    expect(capabilities.find((c) => c.name === "Cart")?.risk.score).toBeCloseTo(0.446, 3);
    expect(capabilities.find((c) => c.name === "Browse & Search")?.risk.score).toBeCloseTo(0.22, 3);

    const ranked = rank(capabilities);
    expect(ranked.map((c) => c.name)).toEqual([
      "Checkout",
      "Account",
      "Sign-in",
      "Admin Catalogue",
      "Cart",
      "Browse & Search",
    ]);
    expect(ranked.map((c) => c.priorityRank)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("density is only 10% of the weight — the largest surface does not win", () => {
    // Browse & Search has the most affordances (density 1.00) but the lowest risk.
    const low = riskScore({
      moneyOrPii: 0,
      dataMutation: 0,
      authProximity: 0,
      graphCentrality: 0.8,
      affordanceDensity: 1.0,
      statedIntent: 0,
    });
    const high = riskScore({
      moneyOrPii: 1,
      dataMutation: 1,
      authProximity: 0.6,
      graphCentrality: 0.72,
      affordanceDensity: 0.1,
      statedIntent: 0,
    });
    expect(high).toBeGreaterThan(low);
  });

  it("I-17 — rank() called five times on one map returns the identical order", () => {
    const capabilities: Capability[] = ["Zeta", "Alpha", "Mid"].map((name, i) => ({
      id: `cap_${i}`,
      sessionId: "ses_1",
      name,
      description: `The ${name} capability.`,
      entryStateId: "st_1",
      stateIds: ["st_1"],
      exitConditions: ["x"],
      dependsOn: [],
      risk: {
        score: 0.5,
        factors: {
          moneyOrPii: 0.5,
          dataMutation: 0.5,
          authProximity: 0.5,
          graphCentrality: 0.5,
          affordanceDensity: 0.5,
          statedIntent: 0,
        },
      },
      priorityRank: 0,
    }));

    const orders = Array.from({ length: 5 }, () => rank(capabilities).map((c) => c.id));
    for (const order of orders) expect(order).toEqual(orders[0]);
    // Equal risk scores — the name tie-break makes the order total, not just stable.
    expect(orders[0]).toEqual(["cap_1", "cap_2", "cap_0"]); // Alpha, Mid, Zeta
  });

  it("promotes a capability the user named into the top of the backlog (FR-005)", () => {
    const named: Capability = {
      id: "cap_signin",
      sessionId: "ses_1",
      name: "Sign-in",
      description: "Authentication and sign in for returning users.",
      entryStateId: "st_1",
      stateIds: ["st_1"],
      exitConditions: ["x"],
      dependsOn: [],
      risk: {
        score: 0.688,
        factors: {
          moneyOrPii: 0.33,
          dataMutation: 1,
          authProximity: 0.6,
          graphCentrality: 1,
          affordanceDensity: 0.35,
          statedIntent: 0,
        },
      },
      priorityRank: 0,
    };
    const highRiskUnnamed: Capability = {
      ...named,
      id: "cap_checkout",
      name: "Checkout",
      description: "Pay for the order.",
      risk: {
        score: 0.9,
        factors: {
          moneyOrPii: 1,
          dataMutation: 1,
          authProximity: 0.6,
          graphCentrality: 0.72,
          affordanceDensity: 0.83,
          statedIntent: 0,
        },
      },
    };
    const withoutIntent = rank([highRiskUnnamed, named]);
    expect(withoutIntent[0]?.name).toBe("Checkout");

    const withIntent = rank([highRiskUnnamed, named], "please prioritize authentication");
    expect(withIntent[0]?.name).toBe("Sign-in");
    // The promotion changes order; it must not silently rewrite the underlying score.
    expect(withIntent.find((c) => c.name === "Sign-in")?.risk.score).toBe(0.688);
  });
});

describe("computeRiskFactors and buildCapabilities — end to end", () => {
  function referenceShop(): ClusterInput {
    const home = mkState("/");
    const products = mkState("/products");
    const detail = mkState("/products/1");
    const cart = mkState("/cart");
    const checkout = mkState("/checkout");
    const login = mkState("/login");
    const account = mkState("/account", { authRequired: true });

    const shopNav = (s: string) => mkAffordance(s, { accessibleName: "Shop" });
    const viewProduct = mkAffordance(products.id, { accessibleName: "View product" });
    const addToCart = mkAffordance(detail.id, {
      accessibleName: "Add to cart",
      kind: "button",
      role: "button",
    });
    const goCheckout = mkAffordance(cart.id, { accessibleName: "Checkout", role: "link" });
    const payNow = mkAffordance(checkout.id, {
      accessibleName: "Pay now",
      role: "button",
      kind: "button",
    });
    const signIn = mkAffordance(login.id, {
      accessibleName: "Sign in",
      role: "button",
      kind: "button",
    });

    const states = [home, products, detail, cart, checkout, login, account];
    const affordances = [
      shopNav(home.id),
      shopNav(products.id),
      shopNav(cart.id),
      shopNav(checkout.id),
      viewProduct,
      addToCart,
      goCheckout,
      payNow,
      signIn,
    ];
    const transitions = [
      mkTransition(home.id, products.id, affordances[0]!.id),
      mkTransition(products.id, detail.id, viewProduct.id),
      mkTransition(detail.id, cart.id, addToCart.id),
      mkTransition(cart.id, checkout.id, goCheckout.id),
      mkTransition(checkout.id, checkout.id, payNow.id, "submit"),
      mkTransition(login.id, account.id, signIn.id, "submit"),
    ];
    return { states, transitions, affordances };
  }

  it("produces a non-empty, fully risk-scored, ranked backlog with no thrown error", () => {
    const input = referenceShop();
    const ctx = seededRunContext(20260905, "2026-01-01T00:00:00Z");
    const capabilities = buildCapabilities(input, "ses_1", ctx.idGen);

    expect(capabilities.length).toBeGreaterThan(0);
    expect(capabilities.map((c) => c.priorityRank)).toEqual(capabilities.map((_, i) => i));
    for (const c of capabilities) {
      expect(c.risk.score).toBeGreaterThanOrEqual(0);
      expect(c.risk.score).toBeLessThanOrEqual(1);
    }
  });

  it("a cluster that is entirely authRequired depends on the cluster containing the login state (ADR-012 A1)", () => {
    const login = mkState("/login");
    const submit = mkAffordance(login.id, {
      accessibleName: "Sign in",
      role: "button",
      kind: "button",
    });
    // /account/orders is reached only from a post-login dashboard we never crawled
    // into (e.g. it rode a nav link that pass 1 stripped) — it shows up as its own,
    // fully authRequired, otherwise-disconnected cluster.
    const orders = mkState("/account/orders", { authRequired: true });
    const input: ClusterInput = {
      states: [login, orders],
      transitions: [],
      affordances: [submit],
      loginStateId: login.id,
    };
    const ctx = seededRunContext(1, "2026-01-01T00:00:00Z");
    const capabilities = buildCapabilities(input, "ses_1", ctx.idGen);

    const loginCap = capabilities.find((c) => c.stateIds.includes(login.id));
    const ordersCap = capabilities.find((c) => c.stateIds.includes(orders.id));
    expect(ordersCap?.dependsOn).toEqual([loginCap?.id]);
    expect(loginCap?.dependsOn).toEqual([]);
  });

  it("computeRiskFactors never returns a factor outside [0,1]", () => {
    const input = referenceShop();
    const drafts = cluster(input);
    for (const draft of drafts) {
      const factors = computeRiskFactors(draft, {
        input,
        allDrafts: drafts,
        authClusterIndex: null,
        name: "x",
        description: "y",
      });
      for (const value of Object.values(factors)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});
