// packages/store/src/redact.test.ts — I-16: no credential literal appears in any
// evidence row, event payload, or generated file.
import { describe, expect, it } from "vitest";
import { REDACTED, redact, redactSecret, redactValue } from "./redact.js";

describe("redactValue — structural redaction (FR-507)", () => {
  it("redacts authorization, cookie, and set-cookie keys case-insensitively", () => {
    const out = redactValue({
      Authorization: "Bearer abc123",
      Cookie: "session=xyz",
      "Set-Cookie": "session=xyz; HttpOnly",
      other: "kept",
    }) as Record<string, unknown>;
    expect(out.Authorization).toBe(REDACTED);
    expect(out.Cookie).toBe(REDACTED);
    expect(out["Set-Cookie"]).toBe(REDACTED);
    expect(out.other).toBe("kept");
  });

  it("redacts key-shaped string values wherever they appear, nested", () => {
    const out = redactValue({
      nested: { apiKey: "sk-abcdefghijklmnopqrstuvwx" },
      list: ["token_abcdefghijklmnop", "a perfectly normal sentence"],
    }) as { nested: { apiKey: string }; list: string[] };
    expect(out.nested.apiKey).toBe(REDACTED);
    expect(out.list[0]).toBe(REDACTED);
    expect(out.list[1]).toBe("a perfectly normal sentence");
  });

  it("leaves ordinary values untouched", () => {
    expect(redactValue({ url: "https://shop.test", count: 3 })).toEqual({
      url: "https://shop.test",
      count: 3,
    });
  });
});

describe("redactSecret — the literal-password sweep (I-16)", () => {
  it("removes an exact secret from anywhere in a serialised value", () => {
    const out = redactSecret({ note: "logged in with hunter2 as the password" }, "hunter2");
    expect(JSON.stringify(out)).not.toContain("hunter2");
  });

  it("is a no-op when no secret is supplied", () => {
    const value = { note: "nothing to redact" };
    expect(redactSecret(value, undefined)).toEqual(value);
    expect(redactSecret(value, null)).toEqual(value);
    expect(redactSecret(value, "")).toEqual(value);
  });
});

describe("redact — the composition used before every write", () => {
  it("applies both structural and literal-secret redaction together", () => {
    const out = redact(
      { headers: { authorization: "Bearer x" }, body: "password is hunter2 exactly" },
      "hunter2",
    );
    expect(JSON.stringify(out)).not.toContain("hunter2");
    expect((out as { headers: { authorization: string } }).headers.authorization).toBe(REDACTED);
  });
});
