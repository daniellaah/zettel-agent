import OpenAI from "openai";
import type {
  ChatCompletionChunk,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

import { parseToolInput, rawFor, type AssistantMessage, type ChatMessage } from "../messages";
import type {
  FinishReason,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  StreamHandlers,
} from "../provider";
import type { FetchLike } from "../recording";
import { describeSdkError } from "./errors";

/**
 * OpenAI-compatible Chat Completions, used for DeepSeek (and usable for other compatible
 * endpoints). DeepSeek specifics:
 * - `reasoning_content` must be sent back in every assistant message whenever the
 *   request carries tools, so assistant messages are replayed verbatim.
 * - `tool_choice` is not supported in thinking mode, so the final no-tools request
 *   switches thinking off to be allowed to send `tool_choice: "none"`.
 */
export interface ChatCompletionsOptions {
  provider: string;
  label: string;
  baseURL: string;
  /** Send DeepSeek's `thinking` parameter and replay `reasoning_content`. */
  deepseekThinking: boolean;
  /** Custom fetch: tests and offline record/replay. */
  fetch?: FetchLike;
}

/** The assistant message as the API returned it, plus DeepSeek's reasoning field. */
type RawAssistant = ChatCompletionMessageParam & { reasoning_content?: string };

interface ChunkDelta {
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: ChatCompletionChunk.Choice.Delta.ToolCall[];
}

interface DeepSeekUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number } | null;
}

export class ChatCompletionsProvider implements ModelProvider {
  readonly provider: string;
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    readonly model: string,
    private readonly options: ChatCompletionsOptions,
  ) {
    this.provider = options.provider;
    this.client = new OpenAI({
      apiKey,
      maxRetries: 0,
      baseURL: options.baseURL,
      dangerouslyAllowBrowser: true,
      ...(options.fetch && { fetch: options.fetch }),
    });
  }

  async send(
    request: ModelRequest,
    handlers: StreamHandlers,
    signal?: AbortSignal,
  ): Promise<ModelResponse> {
    const body: ChatCompletionCreateParamsStreaming & { thinking?: { type: string } } = {
      model: this.model,
      messages: toChatMessages(request.system, request.messages, this.provider, this.model),
      tools: request.tools.map((tool) => ({
        type: "function",
        function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
      })),
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 8192,
    };
    if (!request.allowTools) body.tool_choice = "none";
    if (this.options.deepseekThinking) {
      body.thinking = { type: request.allowTools ? "enabled" : "disabled" };
    }

    const stream = await this.client.chat.completions.create(body, signal ? { signal } : {});
    const accumulator = new ChatStreamAccumulator();
    for await (const chunk of stream) accumulator.add(chunk, handlers);
    return accumulator.finish(this.provider, this.model, this.options.label);
  }

  describeError(error: unknown): string {
    return describeSdkError(error, this.options.label);
  }
}

export function toChatMessages(
  system: string,
  messages: ChatMessage[],
  provider: string,
  model: string,
): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = [{ role: "system", content: system }];
  for (const message of messages) {
    if (message.role === "user") {
      for (const part of message.parts) {
        if (part.type === "tool_result") {
          result.push({ role: "tool", tool_call_id: part.callId, content: part.content });
        }
      }
      const text = message.parts.flatMap((part) => (part.type === "text" ? [part.text] : []));
      if (text.length > 0) result.push({ role: "user", content: text.join("\n\n") });
      continue;
    }
    result.push(rawFor<RawAssistant>(message, provider, model) ?? neutralAssistant(message));
  }
  return result;
}

function neutralAssistant(message: AssistantMessage): RawAssistant {
  const text = message.parts.flatMap((part) => (part.type === "text" ? [part.text] : []));
  const calls = message.parts.flatMap((part) =>
    part.type === "tool_call"
      ? [
          {
            id: part.id,
            type: "function" as const,
            function: { name: part.name, arguments: JSON.stringify(part.input) },
          },
        ]
      : [],
  );
  return {
    role: "assistant",
    content: text.join("") || null,
    // DeepSeek requires the field on every assistant message when tools are sent.
    reasoning_content: "",
    ...(calls.length > 0 && { tool_calls: calls }),
  };
}

/** Folds streamed chunks into one assistant message. */
export class ChatStreamAccumulator {
  private content = "";
  private reasoning = "";
  private readonly calls = new Map<number, { id: string; name: string; arguments: string }>();
  private finishReason: string | null = null;
  private usage: DeepSeekUsage | null = null;

  add(chunk: ChatCompletionChunk, handlers: StreamHandlers): void {
    if (chunk.usage) this.usage = chunk.usage;
    const choice = chunk.choices[0];
    if (!choice) return;
    const delta = choice.delta as ChunkDelta;
    if (delta.reasoning_content) {
      this.reasoning += delta.reasoning_content;
      handlers.onThinking(delta.reasoning_content);
    }
    if (delta.content) {
      this.content += delta.content;
      handlers.onText(delta.content);
    }
    for (const call of delta.tool_calls ?? []) {
      const entry = this.calls.get(call.index) ?? { id: "", name: "", arguments: "" };
      if (call.id) entry.id = call.id;
      if (call.function?.name) entry.name += call.function.name;
      if (call.function?.arguments) entry.arguments += call.function.arguments;
      this.calls.set(call.index, entry);
    }
    if (choice.finish_reason) this.finishReason = choice.finish_reason;
  }

  finish(provider: string, model: string, label: string): ModelResponse {
    if (this.finishReason === "insufficient_system_resource") {
      throw new Error(`${label} is out of capacity right now. Try again shortly.`);
    }
    const calls = [...this.calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => call);
    const parts: AssistantMessage["parts"] = [];
    if (this.reasoning !== "") parts.push({ type: "thinking", text: this.reasoning });
    if (this.content !== "") parts.push({ type: "text", text: this.content });
    for (const call of calls) {
      parts.push({
        type: "tool_call",
        id: call.id,
        name: call.name,
        input: parseToolInput(call.arguments),
      });
    }

    const raw: RawAssistant = {
      role: "assistant",
      content: this.content || null,
      reasoning_content: this.reasoning,
      ...(calls.length > 0 && {
        tool_calls: calls.map((call) => ({
          id: call.id,
          type: "function" as const,
          function: { name: call.name, arguments: call.arguments },
        })),
      }),
    };

    const prompt = this.usage?.prompt_tokens ?? 0;
    const cached =
      this.usage?.prompt_cache_hit_tokens ?? this.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    return {
      message: { role: "assistant", parts, raw: { provider, model, content: raw } },
      finish: finishReason(this.finishReason, calls.length > 0),
      usage: {
        inputTokens: prompt - cached,
        outputTokens: this.usage?.completion_tokens ?? 0,
        cacheReadTokens: cached,
        cacheWriteTokens: 0,
      },
    };
  }
}

function finishReason(reason: string | null, hasCalls: boolean): FinishReason {
  switch (reason) {
    case "length":
      return "max_tokens";
    case "content_filter":
      return "refusal";
    case "tool_calls":
      return "tool_calls";
    default:
      return hasCalls ? "tool_calls" : "end";
  }
}
