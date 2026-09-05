// packages/agents/explorer/src/value.test.ts — 09 §3.3: the deterministic value sort
// IS the no-model fallback. Pure, no browser, no model.
import { describe, expect, it } from "vitest";
import type { Affordance } from "@forge/core";
import {
  compareFrontierItems,
  frontierValue,
  isFormSubmit,
  isNavigational,
  nameInformative,
} from "./value.js";

function aff(overrides: Partial<Affordance> = {}): Affordance {
  return {
    id: "af_1",
    stateId: "st_1",
    ref: "e1",
    role: "link",
    accessibleName: "View product",
    kind: "link",
    enabled: true,
    bbox: null,
    destructive: false,
    observedNotExercised: false,
    notExercisedReason: null,
    ...overrides,
  };
}

describe("isNavigational / isFormSubmit / nameInformative", () => {
  it("treats link, tab and menuitem as navigational", () => {
    expect(isNavigational(aff({ kind: "link" }))).toBe(true);
    expect(isNavigational(aff({ kind: "tab" }))).toBe(true);
    expect(isNavigational(aff({ kind: "menuitem" }))).toBe(true);
    expect(isNavigational(aff({ kind: "button" }))).toBe(false);
  });

  it("treats a non-destructive button as a form submit", () => {
    expect(isFormSubmit(aff({ kind: "button", destructive: false }))).toBe(true);
    expect(isFormSubmit(aff({ kind: "button", destructive: true }))).toBe(false);
    expect(isFormSubmit(aff({ kind: "link" }))).toBe(false);
  });

  it("rejects empty names and bare icon glyphs, accepts real names", () => {
    expect(nameInformative(null)).toBe(false);
    expect(nameInformative("")).toBe(false);
    expect(nameInformative("×")).toBe(false);
    expect(nameInformative("»")).toBe(false);
    expect(nameInformative("Checkout")).toBe(true);
  });
});

describe("frontierValue — the four-term sum", () => {
  it("scores a navigational, informatively-named link with no fanout highest", () => {
    const v = frontierValue(aff({ kind: "link", accessibleName: "View product" }), 0);
    expect(v).toBeCloseTo(0.4 + 0.2 + 0.15, 10);
  });

  it("gives a form submit its 0.25 term", () => {
    const v = frontierValue(
      aff({ kind: "button", accessibleName: "Apply", destructive: false }),
      0,
    );
    expect(v).toBeCloseTo(0.25 + 0.2 + 0.15, 10);
  });

  it("decays the spread term as fanout from the state grows", () => {
    const atZero = frontierValue(aff({ accessibleName: null }), 0);
    const atFive = frontierValue(aff({ accessibleName: null }), 5);
    const atMax = frontierValue(aff({ accessibleName: null }), 10);
    expect(atZero).toBeGreaterThan(atFive);
    expect(atFive).toBeGreaterThan(atMax);
    expect(atMax).toBeCloseTo(0.4, 10); // spread term floors at 0, never negative
  });

  it("a bare icon-glyph textbox scores the lowest", () => {
    const v = frontierValue(aff({ kind: "textbox", accessibleName: "×" }), 0);
    expect(v).toBeCloseTo(0.15, 10);
  });
});

describe("compareFrontierItems — a total order, not just a stable one", () => {
  it("sorts by value descending, then (stateId, ref) ascending", () => {
    const items = [
      { affordance: aff({ ref: "e2" }), fromStateId: "st_2", value: 0.5 },
      { affordance: aff({ ref: "e1" }), fromStateId: "st_1", value: 0.9 },
      { affordance: aff({ ref: "e9" }), fromStateId: "st_1", value: 0.9 },
      { affordance: aff({ ref: "e3" }), fromStateId: "st_1", value: 0.1 },
    ];
    const sorted = [...items].sort(compareFrontierItems);
    expect(sorted.map((i) => i.affordance.ref)).toEqual(["e1", "e9", "e2", "e3"]);
  });

  it("produces an identical order across repeated sorts of the same items", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      affordance: aff({ ref: `e${i}` }),
      fromStateId: `st_${i % 3}`,
      value: (i * 37) % 5,
    }));
    const first = [...items].sort(compareFrontierItems).map((i) => i.affordance.ref);
    for (let attempt = 0; attempt < 5; attempt++) {
      expect([...items].sort(compareFrontierItems).map((i) => i.affordance.ref)).toEqual(first);
    }
  });
});
