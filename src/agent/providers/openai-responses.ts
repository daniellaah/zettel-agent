import OpenAI from "openai";
import type {
  Response,
  ResponseInputItem,
  ResponseOutputItem,
} from "openai/resources/responses/responses";

import { parseToolInput, rawFor, type AssistantMessage, type ChatMessage } from "../messages";
import type {
  FinishReason,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  StreamHandlers,
} from "../provider";
import { describeSdkError } from "./errors";

/**
 * OpenAI through the Responses API, which current models require for tool calling.
 * Stateless (`store: false`): each turn's output items, including encrypted reasoning, are
 * kept in the transcript and sent back, so reasoning carries across tool calls without
 * OpenAI storing the conversation.
 */
export class OpenAIResponsesProvider implements ModelProvider {
  readonly provider = "openai";
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    readonly model: string,
    private readonly effort: "low" | "medium" | "high" = "medium",
  ) {
    this.client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  }

  async send(
    request: ModelRequest,
    handlers: StreamHandlers,
    signal?: AbortSignal,
  ): Promise<ModelResponse> {
    const stream = this.client.responses.stream(
      {
        model: this.model,
        instructions: request.system,
        input: toResponsesInput(request.messages, this.model),
        tools: request.tools.map((tool) => ({
          type: "function",
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
          strict: false,
        })),
        tool_choice: request.allowTools ? "auto" : "none",
        reasoning: { effort: this.effort, summary: "auto" },
        store: false,
        include: ["reasoning.encrypted_content"],
        max_output_tokens: 32_000,
      },
      signal ? { signal } : undefined,
    );
    for await (const event of stream) {
      if (event.type === "response.output_text.delta") handlers.onText(event.delta);
      else if (event.type === "response.reasoning_summary_text.delta") {
        handlers.onThinking(event.delta);
      }
    }
    return fromResponse(await stream.finalResponse(), this.model);
  }

  describeError(error: unknown): string {
    return describeSdkError(error, "OpenAI");
  }
}

export function toResponsesInput(messages: ChatMessage[], model: string): ResponseInputItem[] {
  return messages.flatMap((message): ResponseInputItem[] => {
    if (message.role === "user") {
      // Tool outputs first: they answer the preceding function calls.
      const outputs = message.parts.flatMap((part): ResponseInputItem[] =>
        part.type === "tool_result"
          ? [{ type: "function_call_output", call_id: part.callId, output: part.content }]
          : [],
      );
      const text = message.parts.flatMap((part) => (part.type === "text" ? [part.text] : []));
      return text.length > 0 ? [...outputs, { role: "user", content: text.join("\n\n") }] : outputs;
    }
    const raw = rawFor<ResponseOutputItem[]>(message, "openai", model);
    if (raw) return raw as ResponseInputItem[];
    return message.parts.flatMap((part): ResponseInputItem[] => {
      if (part.type === "text" && part.text !== "")
        return [{ role: "assistant", content: part.text }];
      if (part.type === "tool_call") {
        return [
          {
            type: "function_call",
            call_id: part.id,
            name: part.name,
            arguments: JSON.stringify(part.input),
          },
        ];
      }
      return [];
    });
  });
}

export function fromResponse(response: Response, model: string): ModelResponse {
  const parts: AssistantMessage["parts"] = [];
  let refused = false;
  for (const item of response.output) {
    if (item.type === "reasoning") {
      const summary = item.summary.map((s) => s.text).join("\n\n");
      if (summary !== "") parts.push({ type: "thinking", text: summary });
    } else if (item.type === "message") {
      for (const content of item.content) {
        if (content.type === "output_text") parts.push({ type: "text", text: content.text });
        else if (content.type === "refusal") {
          refused = true;
          parts.push({ type: "text", text: content.refusal });
        }
      }
    } else if (item.type === "function_call") {
      parts.push({
        type: "tool_call",
        id: item.call_id,
        name: item.name,
        input: parseToolInput(item.arguments),
      });
    }
  }

  const cached = response.usage?.input_tokens_details?.cached_tokens ?? 0;
  return {
    message: {
      role: "assistant",
      parts,
      raw: { provider: "openai", model, content: response.output },
    },
    finish: finishReason(response, parts, refused),
    usage: {
      inputTokens: (response.usage?.input_tokens ?? 0) - cached,
      outputTokens: response.usage?.output_tokens ?? 0,
      cacheReadTokens: cached,
      cacheWriteTokens: 0,
    },
  };
}

function finishReason(
  response: Response,
  parts: AssistantMessage["parts"],
  refused: boolean,
): FinishReason {
  const incomplete = response.incomplete_details?.reason;
  if (incomplete === "max_output_tokens") return "max_tokens";
  if (incomplete === "content_filter" || refused) return "refusal";
  return parts.some((part) => part.type === "tool_call") ? "tool_calls" : "end";
}
