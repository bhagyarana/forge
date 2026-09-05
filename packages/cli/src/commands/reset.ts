// packages/cli/src/commands/reset.ts — NFR-9: wipe artifacts/, re-create it. < 20s.
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export function runReset(repoRoot: string): number {
  const artifactsDir = join(repoRoot, "artifacts");
  if (existsSync(artifactsDir)) {
    for (const entry of readdirSync(artifactsDir)) {
      rmSync(join(artifactsDir, entry), { recursive: true, force: true });
    }
  } else {
    mkdirSync(artifactsDir, { recursive: true });
  }
  console.log("forge reset: artifacts/ cleared");
  return 0;
}
