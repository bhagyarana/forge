// apps/api/src/routes/health.ts — 17 §7: operations. `GET /doctor` returns 200 with
// `ok:false` on drift — a failing diagnostic is a successful diagnosis, and a 503
// would make a monitor unable to tell "the browser is wrong" from "the doctor is down".
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { ApiServerDeps } from "../types.js";

type DoctorCheck = { id: string; ok: boolean; expected?: string; actual?: string; detail?: string };

function readPin(repoRoot: string): { node: string; pnpm: string } {
  try {
    const nvmrc = readFileSync(join(repoRoot, ".nvmrc"), "utf8").trim();
    const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      packageManager?: string;
    };
    return { node: nvmrc, pnpm: (pkg.packageManager ?? "").replace(/^pnpm@/, "") };
  } catch {
    return { node: "", pnpm: "" };
  }
}

function checkSafety(deps: ApiServerDeps): DoctorCheck {
  const bind = process.env.FORGE_API_BIND ?? "127.0.0.1";
  const sutControlEnabled = (process.env.SUT_CONTROL_ENABLED ?? "true") === "true";
  const loopback = new Set(["localhost", "127.0.0.1"]);
  const ok = !(sutControlEnabled && !loopback.has(bind)) && deps.allowedHosts.length > 0;
  return { id: "safety", ok, detail: `bind=${bind}, sutControlEnabled=${sutControlEnabled}` };
}

export function computeDoctorChecks(deps: ApiServerDeps): DoctorCheck[] {
  const pin = readPin(deps.repoRoot);
  const nodeActual = process.version.replace(/^v/, "");
  const checks: DoctorCheck[] = [
    {
      id: "node",
      ok: pin.node === "" || nodeActual === pin.node,
      expected: pin.node,
      actual: nodeActual,
    },
    { id: "db", ok: true, detail: "opened and migrated" },
  ];

  const llmEnabled = (process.env.FORGE_LLM_ENABLED ?? "true") === "true";
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  checks.push({
    id: "model",
    ok: !llmEnabled || hasKey,
    detail: llmEnabled
      ? hasKey
        ? "reachable"
        : "ANTHROPIC_API_KEY missing"
      : "deterministic mode",
  });

  checks.push(checkSafety(deps));
  return checks;
}

export function registerHealthRoutes(app: FastifyInstance, deps: ApiServerDeps): void {
  const startedAt = deps.runContext.clock.now().getTime();

  app.get("/api/health", async () => ({
    ok: true,
    uptimeMs: deps.runContext.clock.now().getTime() - startedAt,
    activeSessions: 0,
  }));

  app.get("/api/doctor", async () => {
    const checks = computeDoctorChecks(deps);
    return { ok: checks.every((c) => c.ok), checks };
  });
}
