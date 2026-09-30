import type { AssistantMessage, ChatMessage } from "./messages";

/** A tool as the model sees it: name, description and a JSON Schema for its input. */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ModelRequest {
  system: string;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  /** False on the reserved final request: the model must answer with what it has. */
  allowTools: boolean;
}

/** Why a model response ended, normalized across providers. */
export type FinishReason = "end" | "tool_calls" | "max_tokens" | "refusal" | "pause";

export interface ModelUsage {
  /** Input tokens billed at the full rate. */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface ModelResponse {
  message: AssistantMessage;
  finish: FinishReason;
  usage: ModelUsage;
}

export interface StreamHandlers {
  onText(delta: string): void;
  onThinking(delta: string): void;
}

/** One streamed model request, normalized. The agent loop owns everything else. */
export interface ModelProvider {
  /** Provider id, e.g. "anthropic"; used to route raw content back to its source. */
  readonly provider: string;
  readonly model: string;
  send(
    request: ModelRequest,
    handlers: StreamHandlers,
    signal?: AbortSignal,
  ): Promise<ModelResponse>;
  /** A message the user can act on, for an error thrown by `send`. */
  describeError(error: unknown): string;
}
