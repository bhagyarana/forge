// packages/agents/harness/src/loop.test.ts — every exitReason from 06 §2, driven by a
// small scripted fake ModelClient (dependency injection, not a global mock).
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FrozenClock, ManualClock, type ToolResult } from "@forge/core";
import type { ModelClient, ModelRequest, ModelResponse } from "./model-client.js";
import { runAgentLoop, type AgentLoopSpec, type RegisteredTool } from "./loop.js";

const OutputSchema = z.object({ done: z.literal(true), value: z.string() });
type Output = z.infer<typeof OutputSchema>;

function textResponse(): ModelResponse {
  return {
    stopReason: "end_turn",
    content: [{ type: "text", text: "thinking..." }],
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0 },
  };
}

function toolUseResponse(name: string, input: unknown, id = "tu_1"): ModelResponse {
  return {
    stopReason: "tool_use",
    content: [{ type: "tool_use", id, name, input }],
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0 },
  };
}

/** A tiny scripted fake: returns the next response in a queue on every call. */
class ScriptedModelClient implements ModelClient {
  private calls: ModelRequest[] = [];
  constructor(private readonly script: Array<ModelResponse | (() => ModelResponse)>) {}

  get requestCount(): number {
    return this.calls.length;
  }

  async send(request: ModelRequest): Promise<ModelResponse> {
    this.calls.push(request);
    const next = this.script[this.calls.length - 1] ?? this.script.at(-1);
    if (!next) throw new Error("script exhausted");
    return typeof next === "function" ? next() : next;
  }
}

function baseSpec(overrides: Partial<AgentLoopSpec<Output>> = {}): AgentLoopSpec<Output> {
  return {
    name: "explorer",
    system: "you are a test agent",
    seed: [{ role: "user", content: "go" }],
    tools: [],
    emit: { name: "emit_output", schema: OutputSchema },
    ceilings: { toolCalls: 5, modelTurns: 5, wallClockMs: 60_000, maxTokens: 1024 },
    ...overrides,
  };
}

const fixedClock = new FrozenClock("2026-01-01T00:00:00.000Z");

describe("runAgentLoop — exitReason: EMITTED", () => {
  it("returns the validated output the moment the terminal tool is called", async () => {
    const client = new ScriptedModelClient([
      toolUseResponse("emit_output", { done: true, value: "ok" }),
    ]);
    const result = await runAgentLoop(baseSpec(), client, { clock: fixedClock });
    expect(result).toEqual({
      ok: true,
      output: { done: true, value: "ok" },
      exitReason: "EMITTED",
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, calls: 1 },
    });
  });
});

describe("runAgentLoop — a tool call in between", () => {
  it("dispatches a registered tool and feeds its ToolResult back, never throwing", async () => {
    const tool: RegisteredTool = {
      name: "snapshot",
      description: "take a snapshot",
      inputSchema: { type: "object" },
      execute: (): ToolResult<{ ok: true }> => ({
        ok: true,
        data: { ok: true },
        evidenceIds: ["ev_abcdefgh12"],
        durationMs: 5,
      }),
    };
    const client = new ScriptedModelClient([
      toolUseResponse("snapshot", {}, "tu_1"),
      toolUseResponse("emit_output", { done: true, value: "after-tool" }, "tu_2"),
    ]);
    const result = await runAgentLoop(baseSpec({ tools: [tool] }), client, { clock: fixedClock });
    expect(result.exitReason).toBe("EMITTED");
    expect(result.output?.value).toBe("after-tool");
    expect(result.usage.calls).toBe(2);
  });

  it("an unknown tool name never throws — it comes back as an INTERNAL ToolError", async () => {
    const client = new ScriptedModelClient([
      toolUseResponse("nonexistent_tool", {}, "tu_1"),
      toolUseResponse("emit_output", { done: true, value: "recovered" }, "tu_2"),
    ]);
    const result = await runAgentLoop(baseSpec(), client, { clock: fixedClock });
    expect(result.exitReason).toBe("EMITTED");
  });
});

describe("runAgentLoop — SCHEMA_FAILED after two bad emits in a row", () => {
  it("fails the loop rather than looping forever on invalid structured output", async () => {
    const client = new ScriptedModelClient([
      toolUseResponse("emit_output", { done: true, value: 42 }, "tu_1"), // wrong type
      toolUseResponse("emit_output", { nope: true }, "tu_2"), // missing fields
      toolUseResponse("emit_output", { done: true, value: "too late" }, "tu_3"),
    ]);
    const result = await runAgentLoop(baseSpec(), client, { clock: fixedClock });
    expect(result).toEqual({
      ok: false,
      output: null,
      exitReason: "SCHEMA_FAILED",
      usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 0, calls: 2 },
    });
  });

  it("one repair retry succeeds — a single bad emit is not fatal", async () => {
    const client = new ScriptedModelClient([
      toolUseResponse("emit_output", { done: true, value: 42 }, "tu_1"), // wrong type
      toolUseResponse("emit_output", { done: true, value: "fixed" }, "tu_2"),
    ]);
    const result = await runAgentLoop(baseSpec(), client, { clock: fixedClock });
    expect(result.exitReason).toBe("EMITTED");
    expect(result.output?.value).toBe("fixed");
  });
});

describe("runAgentLoop — MODEL_UNAVAILABLE", () => {
  it("a rejected send() falls back cleanly, never throwing out of the loop", async () => {
    const client: ModelClient = {
      send: () => Promise.reject(new Error("network down")),
    };
    const result = await runAgentLoop(baseSpec(), client, { clock: fixedClock });
    expect(result).toEqual({
      ok: false,
      output: null,
      exitReason: "MODEL_UNAVAILABLE",
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, calls: 0 },
    });
  });
});

describe("runAgentLoop — ceilings force a close and return a partial, validated artefact", () => {
  it("CEILING_TOOL_CALLS forces one final call pinned to the emit tool", async () => {
    const tool: RegisteredTool = {
      name: "click",
      description: "click something",
      inputSchema: { type: "object" },
      execute: (): ToolResult<{ ok: true }> => ({
        ok: true,
        data: { ok: true },
        evidenceIds: [],
        durationMs: 1,
      }),
    };
    // Two tool calls exhaust a ceiling of 2; the third scripted response is what the
    // forced, tool_choice-pinned call receives.
    const client = new ScriptedModelClient([
      toolUseResponse("click", {}, "tu_1"),
      toolUseResponse("click", {}, "tu_2"),
      toolUseResponse("emit_output", { done: true, value: "forced" }, "tu_3"),
    ]);
    const spec = baseSpec({
      tools: [tool],
      ceilings: { toolCalls: 2, modelTurns: 10, wallClockMs: 60_000, maxTokens: 1024 },
    });
    const result = await runAgentLoop(spec, client, { clock: fixedClock });
    expect(result.exitReason).toBe("CEILING_TOOL_CALLS");
    expect(result.ok).toBe(true);
    expect(result.output?.value).toBe("forced");
  });

  it("CEILING_TURNS forces a close after the turn budget is spent", async () => {
    const client = new ScriptedModelClient([
      textResponse(),
      toolUseResponse("emit_output", { done: true, value: "forced-by-turns" }, "tu_1"),
    ]);
    const spec = baseSpec({
      ceilings: { toolCalls: 10, modelTurns: 1, wallClockMs: 60_000, maxTokens: 1024 },
    });
    const result = await runAgentLoop(spec, client, { clock: fixedClock });
    expect(result.exitReason).toBe("CEILING_TURNS");
    expect(result.output?.value).toBe("forced-by-turns");
  });

  it("CEILING_TIME forces a close once the wall clock is exhausted", async () => {
    const advancingClock = new ManualClock("2026-01-01T00:00:00.000Z");
    const client: ModelClient = {
      send: (request: ModelRequest) => {
        advancingClock.advanceMs(100_000); // advance past the ceiling on every call
        if (request.toolChoice) {
          return Promise.resolve(
            toolUseResponse("emit_output", { done: true, value: "forced-by-time" }),
          );
        }
        return Promise.resolve(textResponse());
      },
    };
    const spec = baseSpec({
      ceilings: { toolCalls: 10, modelTurns: 10, wallClockMs: 1000, maxTokens: 1024 },
    });
    const result = await runAgentLoop(spec, client, { clock: advancingClock });
    expect(result.exitReason).toBe("CEILING_TIME");
    expect(result.output?.value).toBe("forced-by-time");
  });

  it("FORCED_CLOSE fires when the model ends its turn twice with no tool call", async () => {
    const client = new ScriptedModelClient([
      textResponse(),
      textResponse(),
      toolUseResponse("emit_output", { done: true, value: "forced-by-silence" }, "tu_1"),
    ]);
    const result = await runAgentLoop(baseSpec(), client, { clock: fixedClock });
    expect(result.exitReason).toBe("FORCED_CLOSE");
    expect(result.output?.value).toBe("forced-by-silence");
  });

  it("a forced close whose final call still fails validation returns a non-ok partial", async () => {
    const client = new ScriptedModelClient([
      textResponse(),
      textResponse(),
      toolUseResponse("emit_output", { nope: "still invalid" }, "tu_1"),
    ]);
    const result = await runAgentLoop(baseSpec(), client, { clock: fixedClock });
    expect(result.exitReason).toBe("FORCED_CLOSE");
    expect(result.ok).toBe(false);
    expect(result.output).toBeNull();
  });
});
