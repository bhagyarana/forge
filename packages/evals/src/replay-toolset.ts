// packages/evals/src/replay-toolset.ts — 16 §3.3: the browser, recorded. The second
// of the harness's two seams. A tape entry carries its evidence alongside it.
import { existsSync, readFileSync } from "node:fs";
import type { ToolResult } from "@forge/core";
import { deriveKey } from "./key.js";

type TapeEntry = {
  key: string;
  seq: number;
  tool: string;
  args: unknown;
  result: ToolResult<unknown>;
  evidence?: Record<string, string>;
};

function loadTape(path: string): Map<string, TapeEntry> {
  const byKey = new Map<string, TapeEntry>();
  if (!existsSync(path)) return byKey;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const entry = JSON.parse(trimmed) as TapeEntry;
    byKey.set(entry.key, entry);
  }
  return byKey;
}

export class MissingTapeEntryError extends Error {}

export class ReplayToolset {
  private readonly byKey: Map<string, TapeEntry>;
  private readonly callCounts = new Map<string, number>();

  constructor(
    private readonly caseId: string,
    tapePath: string,
  ) {
    this.byKey = loadTape(tapePath);
  }

  call(tool: string, args: unknown, stateSignature: string | null = null): ToolResult<unknown> {
    const dedupeKey = `${tool}|${JSON.stringify(args)}|${stateSignature ?? ""}`;
    const callIndex = this.callCounts.get(dedupeKey) ?? 0;
    this.callCounts.set(dedupeKey, callIndex + 1);

    const key = deriveKey({
      caseId: this.caseId,
      toolOrAgent: tool,
      args,
      stateSignature,
      callIndex,
    });
    const entry = this.byKey.get(key);
    if (!entry) {
      throw new MissingTapeEntryError(
        `no recorded tape entry for tool '${tool}' in case '${this.caseId}' (key=${key})`,
      );
    }
    return entry.result;
  }
}
