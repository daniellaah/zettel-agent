import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaMessage,
  BetaMessageParam,
  BetaTool,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";

export interface ModelRequest {
  system: string;
  messages: BetaMessageParam[];
  tools: BetaTool[];
  /** False on the reserved final request: the model must answer with what it has. */
  allowTools: boolean;
}

export interface StreamHandlers {
  onText(delta: string): void;
  onThinking(delta: string): void;
}

/** One streamed model request. The loop owns everything else. */
export interface ModelProvider {
  readonly model: string;
  send(request: ModelRequest, handlers: StreamHandlers, signal?: AbortSignal): Promise<BetaMessage>;
}

export type Effort = "low" | "medium" | "high";

/** Models that take adaptive thinking, effort and server-side refusal fallbacks. */
const CURRENT_GENERATION = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

export class AnthropicProvider implements ModelProvider {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
    private readonly effort: Effort = "medium",
  ) {
    // Obsidian runs the plugin in Electron's renderer; the key never leaves this machine
    // except to api.anthropic.com.
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  }

  async send(
    request: ModelRequest,
    handlers: StreamHandlers,
    signal?: AbortSignal,
  ): Promise<BetaMessage> {
    const current = CURRENT_GENERATION.has(this.model);
    const stream = this.client.beta.messages.stream(
      {
        model: this.model,
        max_tokens: 32_000,
        system: request.system,
        messages: request.messages,
        tools: request.tools,
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
    return stream.finalMessage();
  }
}
