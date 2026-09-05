// packages/agents/harness/src/model-client.ts — a minimal, SDK-decoupled model
// interface. `runAgentLoop()` and its tests depend on THIS shape, never on
// `@anthropic-ai/sdk`'s types directly — that keeps the loop testable with a small
// scripted fake and keeps the real SDK import confined to anthropic-client.ts.
export type ModelTextBlock = { type: "text"; text: string };
export type ModelToolUseBlock = { type: "tool_use"; id: string; name: string; input: unknown };
export type ModelToolResultBlock = {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError: boolean;
};

export type ModelResponseContentBlock = ModelTextBlock | ModelToolUseBlock;
export type ModelRequestContentBlock = ModelTextBlock | ModelToolUseBlock | ModelToolResultBlock;

export type ModelMessage = {
  role: "user" | "assistant";
  content: string | ModelRequestContentBlock[];
};

export type ModelToolSpec = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ModelToolChoice = { type: "auto" } | { type: "tool"; name: string };

export type ModelUsage = { inputTokens: number; outputTokens: number; cacheReadTokens: number };

export type ModelStopReason = "tool_use" | "end_turn" | "max_tokens" | "stop_sequence";

export type ModelResponse = {
  stopReason: ModelStopReason;
  content: ModelResponseContentBlock[];
  usage: ModelUsage;
};

export type ModelRequest = {
  system: string;
  messages: ModelMessage[];
  tools: ModelToolSpec[];
  toolChoice?: ModelToolChoice;
  maxTokens: number;
};

export interface ModelClient {
  send(request: ModelRequest): Promise<ModelResponse>;
}

export function isToolUseBlock(block: ModelResponseContentBlock): block is ModelToolUseBlock {
  return block.type === "tool_use";
}
