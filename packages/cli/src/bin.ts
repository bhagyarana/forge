import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runDoctor } from "./commands/doctor.js";
import { runEval } from "./commands/eval.js";
import { runExplore } from "./commands/explore.js";
import { runReset } from "./commands/reset.js";

export const FORGE_CLI_VERSION = "0.0.0";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");

function parseFlags(argv: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined || !arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);

  switch (command) {
    case "doctor":
      return runDoctor(repoRoot);

    case "eval":
      return runEval(repoRoot, {
        tier: flags.tier === "live" ? "live" : "replay",
        caseId: typeof flags.case === "string" ? flags.case : undefined,
        repeat: typeof flags.repeat === "string" ? Number(flags.repeat) : 1,
        coverage: Boolean(flags.coverage),
      });

    case "reset":
      return runReset(repoRoot);

    case "explore": {
      const url = rest.find((a) => !a.startsWith("--"));
      if (!url) {
        console.error("forge explore: a URL is required — forge explore <url>");
        return 1;
      }
      return runExplore(repoRoot, {
        url,
        ...(typeof flags.username === "string" ? { username: flags.username } : {}),
        ...(typeof flags.password === "string" ? { password: flags.password } : {}),
        ...(typeof flags.intent === "string" ? { intent: flags.intent } : {}),
      });
    }

    default:
      console.error(
        `forge: unknown or not-yet-implemented command '${command ?? ""}'. Available: doctor, eval, reset, explore.`,
      );
      return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(3);
  },
);
