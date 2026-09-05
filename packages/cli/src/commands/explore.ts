// packages/cli/src/commands/explore.ts — Ph2 exit gate: `forge explore <url>`
// produces a map on a real target. Runs the Explorer standalone, outside the session
// FSM (that full-session wiring is later work — see TASKLIST.md Ph2), against a real
// Chromium instance.
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { seededRunContext } from "@forge/core";
import { explore, PlaywrightDriver } from "@forge/agent-explorer";

export type ExploreOptions = {
  url: string;
  username?: string;
  password?: string;
  intent?: string;
  outFile?: string;
};

export async function runExplore(repoRoot: string, options: ExploreOptions): Promise<number> {
  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.error("forge explore: playwright is not installed — run `pnpm doctor` first");
    return 3;
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const ctx = seededRunContext(Number(process.env.FORGE_SEED ?? 20260905));
    const driver = new PlaywrightDriver(page, ctx.clock);

    const credentials =
      options.username && options.password
        ? { username: options.username, password: options.password }
        : undefined;

    console.log(`forge explore: navigating to ${options.url}`);
    const result = await explore(
      {
        url: options.url,
        ...(credentials ? { credentials } : {}),
        ...(options.intent ? { intent: options.intent } : {}),
      },
      { driver, clock: ctx.clock, idGen: ctx.idGen, sessionId: ctx.idGen.next("ses") },
    );

    console.log(`\nstates discovered      ${result.map.states.length}`);
    console.log(`transitions observed    ${result.map.transitions.length}`);
    console.log(`authenticated           ${result.map.authenticated}`);
    console.log(`halt reason             ${result.map.frontier.haltReason}`);
    console.log(`source                  ${result.source} (model calls: ${result.modelCallsMade})`);
    console.log(`\nbacklog (risk-ranked):`);
    for (const cap of result.map.capabilities) {
      console.log(
        `  ${cap.priorityRank + 1}. ${cap.name} — risk ${cap.risk.score.toFixed(3)} — ${cap.stateIds.length} state(s)`,
      );
    }

    const outDir = join(repoRoot, "artifacts", "explore");
    mkdirSync(outDir, { recursive: true });
    const outFile = options.outFile ?? join(outDir, `${result.map.sessionId}.json`);
    writeFileSync(
      outFile,
      JSON.stringify({ map: result.map, affordances: result.affordances }, null, 2),
    );
    console.log(`\nmap written to ${outFile}`);

    return 0;
  } catch (err) {
    console.error(`forge explore: ${err instanceof Error ? err.message : String(err)}`);
    return 3;
  } finally {
    await browser.close();
  }
}
