// packages/evals/src/recorded-model-client.ts — 16 §3.2: the model, recorded. One of
// the harness's two seams (the other is ReplayToolset). Implements the harness's
// ModelClient interface, so a recorded response is indistinguishable from a live one.
import { existsSync, readFileSync } from "node:fs";
import type {
  ModelClient,
  ModelRequest,
  ModelResponse,
  ModelStopReason,
} from "@forge/agent-harness";
import { deriveKey } from "./key.js";

export type FixtureMode = "off" | "replay" | "record";

export class MissingFixtureError extends Error {}

type TranscriptEntry = {
  key: string;
  agent: string;
  turn: number;
  response: { stop_reason: ModelStopReason; content: ModelResponse["content"] };
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number };
};

function loadTranscript(path: string): Map<string, TranscriptEntry> {
  const byKey = new Map<string, TranscriptEntry>();
  if (!existsSync(path)) return byKey;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const entry = JSON.parse(trimmed) as TranscriptEntry;
    byKey.set(entry.key, entry);
  }
  return byKey;
}

/**
 * On a miss: `replay` fails the case naming the missing key; `record` is not
 * implemented here (recording talks to the real Anthropic client and promotes the
 * result — 16 §3.5, a human-reviewed step, not an automated one).
 */
export class RecordedModelClient implements ModelClient {
  private readonly byKey: Map<string, TranscriptEntry>;
  private readonly callCounts = new Map<string, number>();

  constructor(
    private readonly caseId: string,
    private readonly agent: string,
    transcriptPath: string,
    private readonly mode: FixtureMode = "replay",
  ) {
    this.byKey = loadTranscript(transcriptPath);
  }

  async send(request: ModelRequest): Promise<ModelResponse> {
    const dedupeKey = JSON.stringify(request.messages);
    const callIndex = this.callCounts.get(dedupeKey) ?? 0;
    this.callCounts.set(dedupeKey, callIndex + 1);

    const key = deriveKey({
      caseId: this.caseId,
      toolOrAgent: this.agent,
      args: request.messages,
      callIndex,
    });
    const entry = this.byKey.get(key);
    if (!entry) {
      throw new MissingFixtureError(
        `no recorded transcript for agent '${this.agent}' in case '${this.caseId}' (mode=${this.mode}, key=${key})`,
      );
    }
    return {
      stopReason: entry.response.stop_reason,
      content: entry.response.content,
      usage: {
        inputTokens: entry.usage.input_tokens,
        outputTokens: entry.usage.output_tokens,
        cacheReadTokens: entry.usage.cache_read_input_tokens,
      },
    };
  }
}
