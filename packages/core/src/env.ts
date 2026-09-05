// packages/core/src/env.ts — 15 §4.4: determinism has three chokepoints, and no fourth.
// `Date.now()`, `new Date()`, `Math.random()` and `crypto.randomUUID()` outside this file
// are ESLint errors; every consumer takes Clock/Rng/IdGen from RunContext instead.

export interface Clock {
  now(): Date;
}

export interface Rng {
  /** A float in [0, 1), same contract as Math.random(). */
  next(): number;
}

export interface IdGen {
  /** Produces an id matching `^[a-z]{2,4}_[0-9a-z]{8,}$` for the given prefix — 05 §6. */
  next(prefix: string): string;
}

export type RunContext = {
  clock: Clock;
  rng: Rng;
  idGen: IdGen;
};

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FrozenClock implements Clock {
  private readonly at: Date;
  constructor(at: Date | string) {
    this.at = typeof at === "string" ? new Date(at) : at;
  }
  now(): Date {
    return this.at;
  }
}

/**
 * A clock a test can move forward by hand — for asserting ceiling behaviour
 * (06 §2, `wallClockMs`) without ever touching the real clock or `setTimeout`.
 */
export class ManualClock implements Clock {
  private currentMs: number;
  constructor(startAt: Date | string) {
    this.currentMs = (typeof startAt === "string" ? new Date(startAt) : startAt).getTime();
  }
  now(): Date {
    return new Date(this.currentMs);
  }
  advanceMs(ms: number): void {
    this.currentMs += ms;
  }
}

/**
 * mulberry32 — a small, fast, seedable PRNG. `core` may not reach `node:crypto`
 * (barred by `.dependency-cruiser.cjs`'s `no-node-builtins-in-core` rule), and a
 * seeded PRNG is what makes NFR-1 (same seed, same verdicts) possible at all.
 */
export class Mulberry32Rng implements Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";
const RANDOM_SEGMENT_LENGTH = 10;

/** Built from Clock + Rng so the whole id is reproducible under a fixed seed and clock. */
export class RunContextIdGen implements IdGen {
  private counter = 0;

  constructor(
    private readonly clock: Clock,
    private readonly rng: Rng,
  ) {}

  next(prefix: string): string {
    this.counter += 1;
    const time = Math.floor(this.clock.now().getTime()).toString(36);
    let random = "";
    for (let i = 0; i < RANDOM_SEGMENT_LENGTH; i++) {
      random += BASE36[Math.floor(this.rng.next() * BASE36.length)];
    }
    const suffix = `${time}${random}${this.counter.toString(36)}`;
    return `${prefix}_${suffix}`;
  }
}

/** Convenience for tests and CLI wiring: a fully seeded, reproducible RunContext. */
export function seededRunContext(seed: number, frozenAt?: Date | string): RunContext {
  const clock: Clock = frozenAt !== undefined ? new FrozenClock(frozenAt) : new SystemClock();
  const rng = new Mulberry32Rng(seed);
  const idGen = new RunContextIdGen(clock, rng);
  return { clock, rng, idGen };
}
