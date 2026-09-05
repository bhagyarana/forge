// packages/perception/src/affordances.test.ts — 08 §4: mechanical, deterministic extraction.
import { describe, expect, it } from "vitest";
import { seededRunContext } from "@forge/core";
import { affordancesOf, rawAffordancesOf } from "./affordances.js";
import { loadSnapshotFixture } from "./fixtures.js";
import { node, snap } from "./test-helpers.js";
import { join } from "node:path";

const FIXTURES_DIR = join(import.meta.dirname, "..", "..", "..", "fixtures", "perception");

describe("affordancesOf — extraction is mechanical", () => {
  it("emits one affordance per interactive node, in traversal order, with an id and stateId", () => {
    const s = snap(
      "https://x.test/",
      node("document", {}, [
        node("banner", {}, [node("link", { name: "Home", ref: "e1" })]),
        node("main", {}, [
          node("textbox", { name: "Email", ref: "e2", inputType: "email" }),
          node("button", { name: "Go", ref: "e3" }),
        ]),
      ]),
    );
    const ctx = seededRunContext(7, "2026-01-01T00:00:00Z");
    const affordances = affordancesOf(s, "st_abc", ctx.idGen);

    expect(affordances.map((a) => a.ref)).toEqual(["e1", "e2", "e3"]);
    expect(affordances.every((a) => a.stateId === "st_abc")).toBe(true);
    expect(new Set(affordances.map((a) => a.id)).size).toBe(3);
    expect(affordances[0]?.kind).toBe("link");
    expect(affordances[1]?.kind).toBe("textbox");
    expect(affordances[2]?.kind).toBe("button");
  });

  it("does not extract non-interactive nodes", () => {
    const s = snap(
      "https://x.test/",
      node("document", {}, [
        node("heading", { name: "Title", level: 1 }),
        node("text", { name: "body copy" }),
      ]),
    );
    expect(rawAffordancesOf(s)).toHaveLength(0);
  });

  it("maps roles to AffordanceKind — combobox to select, file inputs to upload", () => {
    const s = snap(
      "https://x.test/",
      node("document", {}, [
        node("combobox", { name: "Country", ref: "e1" }),
        node("textbox", { name: "Attachment", ref: "e2", inputType: "file" }),
        node("checkbox", { name: "Remember me", ref: "e3" }),
        node("radio", { name: "Standard shipping", ref: "e4" }),
      ]),
    );
    const kinds = rawAffordancesOf(s).map((a) => a.kind);
    expect(kinds).toEqual(["select", "upload", "checkbox", "radio"]);
  });

  it("carries enabled: false through for a disabled control", () => {
    const s = snap(
      "https://x.test/",
      node("document", {}, [node("button", { name: "Submit", ref: "e1", enabled: false })]),
    );
    expect(rawAffordancesOf(s)[0]?.enabled).toBe(false);
  });

  it("extracts a real fixture's affordances without throwing", () => {
    const fixture = loadSnapshotFixture(join(FIXTURES_DIR, "aperture-checkout.snapshot.yaml"));
    const affordances = rawAffordancesOf(fixture);
    expect(affordances.length).toBeGreaterThan(0);
    expect(new Set(affordances.map((a) => a.ref)).size).toBe(affordances.length);
  });
});
