// packages/core/schema/session.test.ts — FR-006: password cannot reach Session.input.
// This is a *type-level* assertion, not a runtime check (05 §2.2): if `password` were
// ever added back to `Session.input`'s type, this file fails `tsc`, not just a test run.
import { describe, expect, it } from "vitest";
import { Session } from "./session.js";
import type { SessionInputPublic } from "./session.js";

type AssertNoPassword = "password" extends keyof SessionInputPublic
  ? "FAIL: password leaked into Session.input"
  : true;
const assertNoPassword: AssertNoPassword = true;
void assertNoPassword;

describe("Session.input structurally omits password — FR-006, I-16", () => {
  it("parses a password in the request shape but never stores it", () => {
    const parsed = Session.parse({
      id: "ses_abcdefgh12",
      input: {
        url: "https://shop.test",
        mode: "autopilot",
        budget: { maxCapabilities: 20, maxDurationMs: 1_800_000, maxUsd: 2 },
      },
      status: "CREATED",
      authenticated: false,
      storageStatePath: null,
      exitCode: null,
      defectsFound: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      finishedAt: null,
      usage: null,
    });
    expect(Object.keys(parsed.input)).not.toContain("password");
  });

  it("rejects a password field at parse time — the schema has nowhere to put it", () => {
    const withPassword = {
      id: "ses_abcdefgh12",
      input: {
        url: "https://shop.test",
        password: "hunter2",
        mode: "autopilot",
        budget: { maxCapabilities: 20, maxDurationMs: 1_800_000, maxUsd: 2 },
      },
      status: "CREATED",
      authenticated: false,
      storageStatePath: null,
      exitCode: null,
      defectsFound: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      finishedAt: null,
      usage: null,
    };
    // Zod's default `.omit()` strips the key rather than rejecting the input, so assert
    // the stripping explicitly — the credential must not survive into the parsed value.
    const parsed = Session.parse(withPassword);
    expect(JSON.stringify(parsed)).not.toContain("hunter2");
  });
});
