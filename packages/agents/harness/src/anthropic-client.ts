// packages/agents/harness/src/anthropic-client.ts — the ONE file in the repo that
// imports @anthropic-ai/sdk, enforced by dependency-cruiser's `one-model-client` rule
// (.dependency-cruiser.cjs, 06 §2). Everything else talks to the ModelClient interface.
import Anthropic from "@anthropic-ai/sdk";
import type {
  ModelClient,
  ModelMessage,
  ModelRequest,
  ModelRequestContentBlock,
  ModelResponse,
  ModelResponseContentBlock,
  ModelStopReason,
  ModelToolChoice,
} from "./model-client.js";

export class AnthropicModelClient implements ModelClient {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(opts: { apiKey: string; model: string; timeoutMs?: number }) {
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      ...(opts.timeoutMs !== undefined ? { timeout: opts.timeoutMs } : {}),
    });
    this.model = opts.model;
  }

  async send(request: ModelRequest): Promise<ModelResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      system: request.system,
      max_tokens: request.maxTokens,
      messages: request.messages.map(toAnthropicMessage),
      tools: request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: { type: "object" as const, ...t.inputSchema },
      })),
      ...(request.toolChoice ? { tool_choice: toAnthropicToolChoice(request.toolChoice) } : {}),
    });

    return {
      stopReason: toStopReason(response.stop_reason),
      content: response.content.map(toResponseBlock),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        // This SDK version's Usage type does not surface cache-read tokens; 07 §4
        // relies on prompt caching regardless — this becomes non-zero once the SDK does.
        cacheReadTokens: 0,
      },
    };
  }
}

function toAnthropicMessage(message: ModelMessage): Anthropic.MessageParam {
  return {
    role: message.role,
    content:
      typeof message.content === "string" ? message.content : message.content.map(toAnthropicBlock),
  };
}

function toAnthropicBlock(
  block: ModelRequestContentBlock,
): Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam | Anthropic.ToolResultBlockParam {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text };
    case "tool_use":
      return { type: "tool_use", id: block.id, name: block.name, input: block.input };
    case "tool_result":
      return {
        type: "tool_result",
        tool_use_id: block.toolUseId,
        content: block.content,
        is_error: block.isError,
      };
  }
}

function toAnthropicToolChoice(choice: ModelToolChoice): Anthropic.ToolChoice {
  return choice.type === "auto" ? { type: "auto" } : { type: "tool", name: choice.name };
}

function toStopReason(stopReason: string | null): ModelStopReason {
  if (stopReason === "tool_use" || stopReason === "max_tokens" || stopReason === "stop_sequence") {
    return stopReason;
  }
  return "end_turn";
}

function toResponseBlock(block: Anthropic.ContentBlock): ModelResponseContentBlock {
  if (block.type === "tool_use") {
    return { type: "tool_use", id: block.id, name: block.name, input: block.input };
  }
  return { type: "text", text: block.text };
}
