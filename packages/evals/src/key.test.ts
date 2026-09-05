// packages/evals/src/key.test.ts — 16 §3.4: the callIndex/stateSignature
// disambiguation is the case that matters ("the snapshot()-twice case").
import { describe, expect, it } from "vitest";
import { canonicalJson, deriveKey } from "./key.js";

describe("canonicalJson", () => {
  it("sorts keys regardless of insertion order", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it("fixes floats to 6dp so near-equal values key identically", () => {
    expect(canonicalJson({ x: 0.1 + 0.2 })).toBe(canonicalJson({ x: 0.3 }));
  });
});

describe("deriveKey", () => {
  it("is stable for identical inputs", () => {
    const a = deriveKey({
      caseId: "EC-05",
      toolOrAgent: "click",
      args: { locator: "#a" },
      callIndex: 0,
    });
    const b = deriveKey({
      caseId: "EC-05",
      toolOrAgent: "click",
      args: { locator: "#a" },
      callIndex: 0,
    });
    expect(a).toBe(b);
  });

  it("the same call repeated twice from the same state keys DIFFERENTLY by callIndex", () => {
    // The exact scenario named in 16 §3.4: two snapshot() calls from one state during
    // post-heal verification must resolve to the pre-heal and post-heal recordings,
    // never the same one twice.
    const first = deriveKey({
      caseId: "EC-05",
      toolOrAgent: "snapshot",
      args: {},
      stateSignature: "0000000000000001",
      callIndex: 0,
    });
    const second = deriveKey({
      caseId: "EC-05",
      toolOrAgent: "snapshot",
      args: {},
      stateSignature: "0000000000000001",
      callIndex: 1,
    });
    expect(first).not.toBe(second);
  });

  it("a tape entry recorded from a different state can never be silently reused", () => {
    const stateA = deriveKey({
      caseId: "EC-05",
      toolOrAgent: "snapshot",
      args: {},
      stateSignature: "aaaaaaaaaaaaaaaa",
      callIndex: 0,
    });
    const stateB = deriveKey({
      caseId: "EC-05",
      toolOrAgent: "snapshot",
      args: {},
      stateSignature: "bbbbbbbbbbbbbbbb",
      callIndex: 0,
    });
    expect(stateA).not.toBe(stateB);
  });

  it("different cases never collide even with identical tool calls", () => {
    const a = deriveKey({
      caseId: "EC-05",
      toolOrAgent: "click",
      args: { locator: "#a" },
      callIndex: 0,
    });
    const b = deriveKey({
      caseId: "EC-06",
      toolOrAgent: "click",
      args: { locator: "#a" },
      callIndex: 0,
    });
    expect(a).not.toBe(b);
  });
});
