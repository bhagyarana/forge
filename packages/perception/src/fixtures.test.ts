// packages/perception/src/fixtures.test.ts — Ph2.1: fixtures are under the snapshot
// budget in 08 §7 before any detector is built against them.
import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadSnapshotFixture } from "./fixtures.js";
import { snapshotByteSize } from "./render.js";
import { SNAPSHOT_BYTE_BUDGET } from "./constants.js";
import { stateSignature } from "./signature.js";
import { rawAffordancesOf } from "./affordances.js";

const FIXTURES_DIR = join(import.meta.dirname, "..", "..", "..", "fixtures", "perception");
const FIXTURE_NAMES = ["aperture-checkout", "saucedemo-login", "conduit-editor"];

describe("fixtures/perception/*.snapshot.yaml — Ph2.1", () => {
  it("exist, one per structurally different page", () => {
    const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".snapshot.yaml"));
    expect(files.sort()).toEqual(FIXTURE_NAMES.map((n) => `${n}.snapshot.yaml`).sort());
  });

  it.each(FIXTURE_NAMES)("%s loads and is under the 8 KB snapshot budget", (name) => {
    const snapshot = loadSnapshotFixture(join(FIXTURES_DIR, `${name}.snapshot.yaml`));
    expect(snapshotByteSize(snapshot)).toBeLessThan(SNAPSHOT_BYTE_BUDGET);
    expect(snapshot.raw.domBytes).toBeGreaterThan(0);
  });

  it("are structurally different from one another (distinct signatures)", () => {
    const signatures = FIXTURE_NAMES.map((n) =>
      stateSignature(loadSnapshotFixture(join(FIXTURES_DIR, `${n}.snapshot.yaml`))),
    );
    expect(new Set(signatures).size).toBe(FIXTURE_NAMES.length);
  });

  it("each carries at least one affordance", () => {
    for (const name of FIXTURE_NAMES) {
      const snapshot = loadSnapshotFixture(join(FIXTURES_DIR, `${name}.snapshot.yaml`));
      expect(rawAffordancesOf(snapshot).length).toBeGreaterThan(0);
    }
  });
});
