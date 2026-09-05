// packages/agents/harness/src/loop.ts — 06 §2: runAgentLoop(), the one place a loop
// is written. Every ceiling below is a counter, not a prompt instruction (ADR-008).
import type { z } from "zod";
import type { ToolResult } from "@forge/core";
import type {
  ModelClient,
  ModelMessage,
  ModelRequestContentBlock,
  ModelToolResultBlock,
  ModelToolSpec,
} from "./model-client.js";
import { isToolUseBlock } from "./model-client.js";

export type RegisteredTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: unknown) => Promise<ToolResult<unknown>> | ToolResult<unknown>;
};

export type AgentLoopSpec<TOut> = {
  name: "explorer" | "planner";
  system: string;
  seed: ModelMessage[];
  tools: RegisteredTool[];
  emit: { name: string; schema: z.ZodType<TOut> };
  ceilings: { toolCalls: number; modelTurns: number; wallClockMs: number; maxTokens: number };
};

export type AgentLoopExitReason =
  | "EMITTED"
  | "CEILING_TOOL_CALLS"
  | "CEILING_TURNS"
  | "CEILING_TIME"
  | "FORCED_CLOSE"
  | "SCHEMA_FAILED"
  | "MODEL_UNAVAILABLE";

export type AgentLoopUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  calls: number;
};

export type AgentLoopResult<TOut> = {
  ok: boolean;
  output: TOut | null;
  exitReason: AgentLoopExitReason;
  usage: AgentLoopUsage;
};

export type AgentLoopClock = { now(): Date };

const SCHEMA_FAILURE_LIMIT = 2;

function toModelToolSpec(tool: RegisteredTool): ModelToolSpec {
  return { name: tool.name, description: tool.description, inputSchema: tool.inputSchema };
}

function emptyUsage(): AgentLoopUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, calls: 0 };
}

export async function runAgentLoop<TOut>(
  spec: AgentLoopSpec<TOut>,
  client: ModelClient,
  ctx: { clock: AgentLoopClock },
): Promise<AgentLoopResult<TOut>> {
  const startedAtMs = ctx.clock.now().getTime();
  const messages: ModelMessage[] = [...spec.seed];
  const usage = emptyUsage();
  const emitToolSpec: ModelToolSpec = {
    name: spec.emit.name,
    description: `Terminal tool. Calling this ends the ${spec.name} loop with its final output.`,
    inputSchema: { type: "object" },
  };
  const tools = [...spec.tools.map(toModelToolSpec), emitToolSpec];

  let toolCalls = 0;
  let turns = 0;
  let schemaFailures = 0;
  let consecutiveEmptyTurns = 0;

  while (true) {
    if (ctx.clock.now().getTime() - startedAtMs > spec.ceilings.wallClockMs) {
      return finish(await forceEmit(spec, client, messages, tools, usage), "CEILING_TIME", usage);
    }
    if (turns >= spec.ceilings.modelTurns) {
      return finish(await forceEmit(spec, client, messages, tools, usage), "CEILING_TURNS", usage);
    }
    if (toolCalls >= spec.ceilings.toolCalls) {
      return finish(
        await forceEmit(spec, client, messages, tools, usage),
        "CEILING_TOOL_CALLS",
        usage,
      );
    }

    let response;
    try {
      response = await client.send({
        system: spec.system,
        messages,
        tools,
        maxTokens: spec.ceilings.maxTokens,
      });
    } catch {
      return { ok: false, output: null, exitReason: "MODEL_UNAVAILABLE", usage };
    }

    turns += 1;
    usage.calls += 1;
    usage.inputTokens += response.usage.inputTokens;
    usage.outputTokens += response.usage.outputTokens;
    usage.cacheReadTokens += response.usage.cacheReadTokens;
    messages.push({ role: "assistant", content: response.content });

    const toolUseBlocks = response.content.filter(isToolUseBlock);

    if (toolUseBlocks.length === 0) {
      consecutiveEmptyTurns += 1;
      if (consecutiveEmptyTurns >= 2) {
        return finish(await forceEmit(spec, client, messages, tools, usage), "FORCED_CLOSE", usage);
      }
      messages.push({
        role: "user",
        content: "Continue the task, or call the terminal tool with your final output.",
      });
      continue;
    }
    consecutiveEmptyTurns = 0;

    const toolResultBlocks: ModelToolResultBlock[] = [];
    let emitted: TOut | null = null;

    for (const block of toolUseBlocks) {
      if (block.name === spec.emit.name) {
        const parsed = spec.emit.schema.safeParse(block.input);
        if (parsed.success) {
          emitted = parsed.data;
        } else {
          schemaFailures += 1;
          toolResultBlocks.push({
            type: "tool_result",
            toolUseId: block.id,
            isError: true,
            content: JSON.stringify(parsed.error.issues),
          });
        }
        continue;
      }

      toolCalls += 1;
      const tool = spec.tools.find((t) => t.name === block.name);
      const result: ToolResult<unknown> = tool
        ? await tool.execute(block.input)
        : {
            ok: false,
            error: { code: "INTERNAL", message: `unknown tool: ${block.name}` },
            evidenceIds: [],
            durationMs: 0,
          };
      toolResultBlocks.push({
        type: "tool_result",
        toolUseId: block.id,
        isError: !result.ok,
        content: JSON.stringify(result),
      });
    }

    if (emitted !== null) {
      return { ok: true, output: emitted, exitReason: "EMITTED", usage };
    }

    if (schemaFailures >= SCHEMA_FAILURE_LIMIT) {
      return { ok: false, output: null, exitReason: "SCHEMA_FAILED", usage };
    }

    if (toolResultBlocks.length > 0) {
      messages.push({ role: "user", content: toolResultBlocks as ModelRequestContentBlock[] });
    }
  }
}

type ForcedEmitResult<TOut> = { output: TOut | null; ok: boolean };

async function forceEmit<TOut>(
  spec: AgentLoopSpec<TOut>,
  client: ModelClient,
  messages: ModelMessage[],
  tools: ModelToolSpec[],
  usage: AgentLoopUsage,
): Promise<ForcedEmitResult<TOut>> {
  try {
    const response = await client.send({
      system: spec.system,
      messages,
      tools,
      toolChoice: { type: "tool", name: spec.emit.name },
      maxTokens: spec.ceilings.maxTokens,
    });
    usage.calls += 1;
    usage.inputTokens += response.usage.inputTokens;
    usage.outputTokens += response.usage.outputTokens;
    usage.cacheReadTokens += response.usage.cacheReadTokens;

    const block = response.content.filter(isToolUseBlock).find((b) => b.name === spec.emit.name);
    if (!block) return { output: null, ok: false };
    const parsed = spec.emit.schema.safeParse(block.input);
    return parsed.success ? { output: parsed.data, ok: true } : { output: null, ok: false };
  } catch {
    return { output: null, ok: false };
  }
}

function finish<TOut>(
  forced: ForcedEmitResult<TOut>,
  exitReason: AgentLoopExitReason,
  usage: AgentLoopUsage,
): AgentLoopResult<TOut> {
  return { ok: forced.ok, output: forced.output, exitReason, usage };
}
