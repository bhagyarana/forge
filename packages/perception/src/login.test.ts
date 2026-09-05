// packages/perception/src/login.test.ts — 09 §2.1, §2.2. FR-101. Pure, no model.
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { detectLoginForm, authOutcome } from "./login.js";
import { loadSnapshotFixture } from "./fixtures.js";
import { node, snap } from "./test-helpers.js";

const FIXTURES_DIR = join(import.meta.dirname, "..", "..", "..", "fixtures", "perception");
const FIXTURES = ["aperture-checkout", "saucedemo-login", "conduit-editor"];

describe("detectLoginForm — FR-101: three structurally different pages, zero configuration", () => {
  it.each(FIXTURES)("reaches confidence 1.00 on %s.snapshot.yaml", (name) => {
    const snapshot = loadSnapshotFixture(join(FIXTURES_DIR, `${name}.snapshot.yaml`));
    const form = detectLoginForm(snapshot);
    expect(form).not.toBeNull();
    expect(form?.confidence).toBe(1.0);
  });
});

describe("detectLoginForm — the three signals and the confidence ladder (09 §2.1)", () => {
  it("returns null when there is no password field", () => {
    const s = snap(
      "https://x.test/",
      node("document", {}, [
        node("form", {}, [
          node("textbox", { name: "Email", ref: "e1" }),
          node("button", { name: "Go", ref: "e2" }),
        ]),
      ]),
    );
    expect(detectLoginForm(s)).toBeNull();
  });

  it("returns null when two password fields are present — a registration form, not a login", () => {
    const s = snap(
      "https://x.test/",
      node("document", {}, [
        node("form", {}, [
          node("textbox", { name: "Email", ref: "e1" }),
          node("textbox", { name: "Password", ref: "e2", inputType: "password" }),
          node("textbox", { name: "Confirm password", ref: "e3", inputType: "password" }),
          node("button", { name: "Sign up", ref: "e4" }),
        ]),
      ]),
    );
    expect(detectLoginForm(s)).toBeNull();
  });

  it("returns null when the identity field is missing entirely", () => {
    const s = snap(
      "https://x.test/",
      node("document", {}, [
        node("form", {}, [
          node("textbox", { name: "Password", ref: "e1", inputType: "password" }),
          node("button", { name: "Sign in", ref: "e2" }),
        ]),
      ]),
    );
    expect(detectLoginForm(s)).toBeNull();
  });

  it("returns null when no submit control can be found", () => {
    const s = snap(
      "https://x.test/",
      node("main", {}, [
        node("textbox", { name: "Email", ref: "e1" }),
        node("textbox", { name: "Password", ref: "e2", inputType: "password" }),
        node("button", { name: "Learn more", ref: "e3" }), // doesn't match the submit-name fallback
        node("button", { name: "Contact us", ref: "e4" }), // two enabled buttons — landmark rule can't pick one
      ]),
    );
    expect(detectLoginForm(s)).toBeNull();
  });

  it("scores 0.80 when all three are found in the same landmark but there is no <form>", () => {
    const s = snap(
      "https://x.test/",
      node("main", {}, [
        node("textbox", { name: "Email", ref: "e1" }),
        node("textbox", { name: "Password", ref: "e2", inputType: "password" }),
        node("button", { name: "Log in", ref: "e3" }),
      ]),
    );
    const form = detectLoginForm(s);
    expect(form?.confidence).toBe(0.8);
  });

  it("scores 0.60 when the three signals are found in different scopes", () => {
    const s = snap(
      "https://x.test/",
      node("document", {}, [
        node("textbox", { name: "Email", ref: "e1" }), // no enclosing landmark or form
        node("main", {}, [node("textbox", { name: "Password", ref: "e2", inputType: "password" })]),
        node("contentinfo", {}, [node("button", { name: "Sign in", ref: "e3" })]),
      ]),
    );
    const form = detectLoginForm(s);
    expect(form?.confidence).toBe(0.6);
  });

  it("falls back to the nearest preceding textbox when none matches the identity lexicon", () => {
    const s = snap(
      "https://x.test/",
      node("form", {}, [
        node("textbox", { name: "Company", ref: "e1" }), // no identity-lexicon match
        node("textbox", { name: "Password", ref: "e2", inputType: "password" }),
        node("button", { name: "Continue", ref: "e3" }),
      ]),
    );
    const form = detectLoginForm(s);
    expect(form?.identityRef).toBe("e1");
    expect(form?.confidence).toBe(1.0);
  });
});

describe("authOutcome — the structural verdict (09 §2.2)", () => {
  const loginPage = () =>
    snap(
      "https://x.test/login",
      node("form", {}, [
        node("textbox", { name: "Email", ref: "e1" }),
        node("textbox", { name: "Password", ref: "e2", inputType: "password" }),
        node("button", { name: "Sign in", ref: "e3" }),
      ]),
    );

  it("AUTHENTICATED — signature changed, password field gone", () => {
    const after = snap(
      "https://x.test/dashboard",
      node("main", {}, [
        node("heading", { name: "Dashboard", level: 1 }),
        node("link", { name: "Sign out", ref: "e1" }),
      ]),
    );
    expect(authOutcome(loginPage(), after)).toEqual({ verdict: "AUTHENTICATED" });
  });

  it("AUTHENTICATED — a sign-out affordance appears even if a password field lingers", () => {
    const after = snap(
      "https://x.test/dashboard",
      node("main", {}, [
        node("link", { name: "My account", ref: "e1" }),
        node("textbox", { name: "Password", ref: "e2", inputType: "password" }),
      ]),
    );
    expect(authOutcome(loginPage(), after)).toEqual({ verdict: "AUTHENTICATED" });
  });

  it("CREDENTIALS_REJECTED — signature changed, password field remains", () => {
    const after = snap(
      "https://x.test/login",
      node("form", {}, [
        node("status", { name: "Invalid email or password" }),
        node("textbox", { name: "Email", ref: "e1" }),
        node("textbox", { name: "Password", ref: "e2", inputType: "password" }),
        node("button", { name: "Sign in", ref: "e3" }),
      ]),
    );
    expect(authOutcome(loginPage(), after)).toEqual({ verdict: "CREDENTIALS_REJECTED" });
  });

  it("NOTHING_HAPPENED — signature unchanged", () => {
    const page = loginPage();
    expect(authOutcome(page, page)).toEqual({ verdict: "NOTHING_HAPPENED" });
  });

  it("OUT_OF_SCOPE — navigation left the origin (SSO)", () => {
    const after = snap("https://sso.example.com/consent", node("main", {}, []));
    expect(authOutcome(loginPage(), after, { navigatedOffOrigin: true })).toEqual({
      verdict: "OUT_OF_SCOPE",
    });
  });
});
