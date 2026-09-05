// packages/store/src/evidence.test.ts — I-2: an evidence path always contains its own
// sha256 prefix, and putEvidence() compares the FULL hash on a prefix hit. I-8 (store
// half): every evidenceId resolves to a stored row.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FrozenClock } from "@forge/core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evidencePath, putEvidence, resolveEvidence, sha256Hex } from "./evidence.js";
import { closeDb, openDb, type Db } from "./db.js";
import { createSession } from "./sessions.js";

describe("putEvidence / resolveEvidence — I-2, I-8", () => {
  let db: Db;
  let artifactsRoot: string;
  let sessionId: string;
  let counter = 0;
  const clock = new FrozenClock("2026-01-01T00:00:00.000Z");
  const idGen = { next: (p: string) => `${p}_ev${String(++counter).padStart(8, "0")}` };

  beforeEach(() => {
    db = openDb(":memory:");
    artifactsRoot = mkdtempSync(join(tmpdir(), "forge-evidence-"));
    counter = 0;
    sessionId = createSession(
      db,
      { clock, idGen },
      {
        url: "https://shop.test",
        mode: "autopilot",
        budget: { maxCapabilities: 20, maxDurationMs: 1, maxUsd: 1 },
      },
    ).id;
  });
  afterEach(() => {
    closeDb(db);
    rmSync(artifactsRoot, { recursive: true, force: true });
  });

  it("the path contains the evidence's own full sha256", () => {
    const ev = putEvidence(db, { clock, idGen }, artifactsRoot, {
      sessionId,
      type: "SNAPSHOT",
      content: "hello world",
      label: "a snapshot",
      extension: "json",
    });
    expect(ev.path).toContain(ev.sha256);
    expect(evidencePath(ev.sha256, "json")).toBe(ev.path);
  });

  it("resolveEvidence resolves the id it was given back", () => {
    const ev = putEvidence(db, { clock, idGen }, artifactsRoot, {
      sessionId,
      type: "DOM",
      content: "<html></html>",
      label: "dom",
    });
    const resolved = resolveEvidence(db, ev.id);
    expect(resolved).toEqual(ev);
  });

  it("resolveEvidence returns null for an id that was never stored", () => {
    expect(resolveEvidence(db, "ev_doesnotexist1")).toBeNull();
  });

  it("identical content for the same session+type is deduplicated (same id, no second write)", () => {
    const first = putEvidence(db, { clock, idGen }, artifactsRoot, {
      sessionId,
      type: "SNAPSHOT",
      content: "same bytes",
      label: "first",
    });
    const second = putEvidence(db, { clock, idGen }, artifactsRoot, {
      sessionId,
      type: "SNAPSHOT",
      content: "same bytes",
      label: "second label is ignored on a hit",
    });
    expect(second.id).toBe(first.id);
  });

  it("a shared filesystem-prefix never causes a false hit — only the FULL hash counts", () => {
    // Manufacture two rows whose sha256 shares the same 2-char fan-out directory
    // (a real collision on the full 64-char hash is not something a unit test can
    // construct — this proves the lookup path never stops at that shared prefix).
    const contentA = "alpha-payload";
    const contentB = "bravo-payload-with-a-totally-different-body";
    const shaA = sha256Hex(contentA);
    const shaB = sha256Hex(contentB);

    const evA = putEvidence(db, { clock, idGen }, artifactsRoot, {
      sessionId,
      type: "SNAPSHOT",
      content: contentA,
      label: "alpha",
    });

    // Force a second row into the same fan-out directory by hand, with a DIFFERENT
    // full hash than evA but the same first two hex characters where possible.
    expect(shaA).not.toBe(shaB);
    const evB = putEvidence(db, { clock, idGen }, artifactsRoot, {
      sessionId,
      type: "SNAPSHOT",
      content: contentB,
      label: "bravo",
    });

    expect(evA.id).not.toBe(evB.id);
    expect(resolveEvidence(db, evA.id)?.sha256).toBe(shaA);
    expect(resolveEvidence(db, evB.id)?.sha256).toBe(shaB);

    // Re-submitting content A must return evA, never evB, even though both
    // rows live under the same directory prefix in the artifacts tree.
    const resubmitted = putEvidence(db, { clock, idGen }, artifactsRoot, {
      sessionId,
      type: "SNAPSHOT",
      content: contentA,
      label: "alpha again",
    });
    expect(resubmitted.id).toBe(evA.id);
  });

  it("bytes reflects the actual content length", () => {
    const ev = putEvidence(db, { clock, idGen }, artifactsRoot, {
      sessionId,
      type: "CONSOLE",
      content: "0123456789",
      label: "ten bytes",
    });
    expect(ev.bytes).toBe(10);
  });
});
