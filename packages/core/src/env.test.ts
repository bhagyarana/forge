// packages/core/src/env.test.ts — 15 §4.4: the three determinism chokepoints.
import { describe, expect, it } from "vitest";
import { Id } from "../schema/primitives.js";
import {
  FrozenClock,
  ManualClock,
  Mulberry32Rng,
  RunContextIdGen,
  SystemClock,
  seededRunContext,
} from "./env.js";

describe("Clock", () => {
  it("FrozenClock always returns the same instant", () => {
    const clock = new FrozenClock("2026-01-01T00:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(clock.now().toISOString()).toBe(clock.now().toISOString());
  });

  it("ManualClock only moves when told to", () => {
    const clock = new ManualClock("2026-01-01T00:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:00.000Z");
    clock.advanceMs(60_000);
    expect(clock.now().toISOString()).toBe("2026-01-01T00:01:00.000Z");
  });

  it("SystemClock returns a real, parseable instant", () => {
    const clock = new SystemClock();
    expect(Number.isNaN(clock.now().getTime())).toBe(false);
  });
});

describe("Rng — Mulberry32", () => {
  it("is seedable and reproducible", () => {
    const a = new Mulberry32Rng(20260905);
    const b = new Mulberry32Rng(20260905);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
  });

  it("produces values in [0, 1)", () => {
    const rng = new Mulberry32Rng(1);
    for (let i = 0; i < 100; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("different seeds diverge", () => {
    const a = new Mulberry32Rng(1).next();
    const b = new Mulberry32Rng(2).next();
    expect(a).not.toBe(b);
  });
});

describe("IdGen", () => {
  it("mints ids matching the generic Id regex", () => {
    const clock = new FrozenClock("2026-01-01T00:00:00.000Z");
    const rng = new Mulberry32Rng(20260905);
    const idGen = new RunContextIdGen(clock, rng);
    const id = idGen.next("ses");
    expect(Id.safeParse(id).success).toBe(true);
    expect(id.startsWith("ses_")).toBe(true);
  });

  it("never repeats within one RunContext, even at the same frozen instant", () => {
    const clock = new FrozenClock("2026-01-01T00:00:00.000Z");
    const rng = new Mulberry32Rng(20260905);
    const idGen = new RunContextIdGen(clock, rng);
    const ids = new Set(Array.from({ length: 50 }, () => idGen.next("ses")));
    expect(ids.size).toBe(50);
  });

  it("seededRunContext is fully reproducible under a fixed seed and clock", () => {
    const a = seededRunContext(20260905, "2026-01-01T00:00:00.000Z");
    const b = seededRunContext(20260905, "2026-01-01T00:00:00.000Z");
    expect(a.idGen.next("ses")).toBe(b.idGen.next("ses"));
    expect(a.rng.next()).toBe(b.rng.next());
  });
});
