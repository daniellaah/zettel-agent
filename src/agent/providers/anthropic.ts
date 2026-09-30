import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";

import { rawFor, type AssistantMessage, type ChatMessage } from "../messages";
import type {
  FinishReason,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  StreamHandlers,
} from "../provider";
import type { FetchLike } from "../recording";
import { describeSdkError } from "./errors";

export type Effort = "low" | "medium" | "high";

/** Models that take adaptive thinking, effort and server-side refusal fallbacks. */
const CURRENT_GENERATION = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

export class AnthropicProvider implements ModelProvider {
  readonly provider = "anthropic";
  private readonly client: Anthropic;
  private readonly effort: Effort;

  constructor(
    apiKey: string,
    readonly model: string,
    options: { effort?: Effort; fetch?: FetchLike } = {},
  ) {
    this.effort = options.effort ?? "medium";
    // Obsidian runs plugins in Electron's renderer; the key only goes to api.anthropic.com.
    this.client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
      ...(options.fetch && { fetch: options.fetch }),
    });
  }

  async send(
    request: ModelRequest,
    handlers: StreamHandlers,
    signal?: AbortSignal,
  ): Promise<ModelResponse> {
    const current = CURRENT_GENERATION.has(this.model);
    const stream = this.client.beta.messages.stream(
      {
        model: this.model,
        max_tokens: 32_000,
        system: request.system,
        messages: toAnthropicMessages(request.messages, this.model),
        tools: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema as { type: "object" },
        })),
        tool_choice: { type: request.allowTools ? "auto" : "none" },
        // Caches the longest stable prefix: tools, system prompt and prior turns.
        cache_control: { type: "ephemeral" },
        ...(current && {
          thinking: { type: "adaptive", display: "summarized" },
          output_config: { effort: this.effort },
          // On a safety refusal, the API reruns the request on a suitable fallback model.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        }),
      },
      signal ? { signal } : undefined,
    );
    for await (const event of stream) {
      if (event.type !== "content_block_delta") continue;
      if (event.delta.type === "text_delta") handlers.onText(event.delta.text);
      else if (event.delta.type === "thinking_delta") handlers.onThinking(event.delta.thinking);
    }
    return fromAnthropicMessage(await stream.finalMessage(), this.model);
  }

  describeError(error: unknown): string {
    return describeSdkError(error, "Anthropic");
  }
}

export function toAnthropicMessages(messages: ChatMessage[], model: string): BetaMessageParam[] {
  return messages.map((message): BetaMessageParam => {
    if (message.role === "user") {
      return {
        role: "user",
        content: message.parts.map((part): BetaContentBlockParam =>
          part.type === "text"
            ? { type: "text", text: part.text }
            : {
                type: "tool_result",
                tool_use_id: part.callId,
                content: part.content,
                ...(part.isError && { is_error: true }),
              },
        ),
      };
    }
    // The same model gets its own content back verbatim (thinking signatures included).
    const raw = rawFor<BetaContentBlockParam[]>(message, "anthropic", model);
    return { role: "assistant", content: raw ?? neutralContent(message) };
  });
}

function neutralContent(message: AssistantMessage): BetaContentBlockParam[] {
  const blocks = message.parts.flatMap((part): BetaContentBlockParam[] => {
    if (part.type === "text" && part.text !== "") return [{ type: "text", text: part.text }];
    if (part.type === "tool_call") {
      return [{ type: "tool_use", id: part.id, name: part.name, input: part.input }];
    }
    return []; // Thinking from another model cannot be replayed.
  });
  return blocks.length > 0 ? blocks : [{ type: "text", text: "(no response)" }];
}

export function fromAnthropicMessage(message: BetaMessage, model: string): ModelResponse {
  const parts = message.content.flatMap((block): AssistantMessage["parts"] => {
    if (block.type === "text") return [{ type: "text", text: block.text }];
    if (block.type === "thinking") return [{ type: "thinking", text: block.thinking }];
    if (block.type === "tool_use") {
      return [{ type: "tool_call", id: block.id, name: block.name, input: block.input }];
    }
    return [];
  });
  return {
    message: {
      role: "assistant",
      parts,
      raw: { provider: "anthropic", model, content: message.content },
    },
    finish: finishReason(message.stop_reason),
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    },
  };
}

function finishReason(reason: BetaMessage["stop_reason"]): FinishReason {
  switch (reason) {
    case "tool_use":
      return "tool_calls";
    case "max_tokens":
    case "model_context_window_exceeded":
      return "max_tokens";
    case "refusal":
      return "refusal";
    case "pause_turn":
      return "pause";
    default:
      return "end";
  }
}
