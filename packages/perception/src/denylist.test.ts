// packages/perception/src/denylist.test.ts — 08 §4.1, I-20.
import { describe, expect, it } from "vitest";
import { seededRunContext } from "@forge/core";
import { isDestructive } from "./denylist.js";
import { affordancesOf } from "./affordances.js";
import { node, snap } from "./test-helpers.js";

describe("isDestructive — the exploration deny-list (08 §4.1)", () => {
  it.each([
    "Delete order",
    "Cancel order",
    "Place order",
    "Submit order",
    "Pay now",
    "Transfer funds",
    "Close account",
    "Refund",
    "Discard draft",
    "Revoke access",
    "Terminate session",
    "Clear cart",
    "Reset password", // matches "reset", deliberately broad
    "Deactivate account",
    "Unsubscribe",
  ])("flags '%s' as destructive", (name) => {
    expect(isDestructive(name)).toBe(true);
  });

  it.each(["Apply", "Continue", "Add to cart", "Sign in", "Search", null])(
    "does not flag '%s'",
    (name) => {
      expect(isDestructive(name)).toBe(false);
    },
  );

  it("is broader than a benign healing target — 'place order' is legitimate for a generated test", () => {
    // The note in 08 §4.1: this list intentionally also catches verbs that are fine
    // for a generated test to *do*, but never fine for a crawler to press uninvited.
    expect(isDestructive("Place order")).toBe(true);
  });
});

describe("I-20 — every destructive affordance is also observedNotExercised", () => {
  it("holds at extraction time, before any exploration decision is made", () => {
    const s = snap(
      "https://shop.example.com/checkout",
      node("document", {}, [
        node("main", {}, [
          node("button", { name: "Place order", ref: "e1" }),
          node("button", { name: "Cancel order", ref: "e2" }),
          node("button", { name: "Apply coupon", ref: "e3" }),
        ]),
      ]),
    );
    const ctx = seededRunContext(1, "2026-01-01T00:00:00Z");
    const affordances = affordancesOf(s, "st_test", ctx.idGen);

    for (const a of affordances) {
      if (a.destructive) {
        expect(a.observedNotExercised).toBe(true);
        expect(a.notExercisedReason).toBe("DENY_LIST");
      }
    }
    expect(affordances.filter((a) => a.destructive)).toHaveLength(2);
    expect(affordances.find((a) => a.accessibleName === "Apply coupon")?.destructive).toBe(false);
  });
});
