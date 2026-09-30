import type { ModelProvider } from "../provider";
import type { FetchLike } from "../recording";
import { AnthropicProvider } from "./anthropic";
import type { ProviderId } from "./catalog";
import { ChatCompletionsProvider } from "./chat-completions";
import { OpenAIResponsesProvider } from "./openai-responses";

/** `fetch` replaces the network, for offline record/replay. */
export function createProvider(
  id: ProviderId,
  apiKey: string,
  model: string,
  fetch?: FetchLike,
): ModelProvider {
  const options = fetch ? { fetch } : {};
  switch (id) {
    case "anthropic":
      return new AnthropicProvider(apiKey, model, options);
    case "openai":
      return new OpenAIResponsesProvider(apiKey, model, options);
    case "deepseek":
      return new ChatCompletionsProvider(apiKey, model, {
        provider: "deepseek",
        label: "DeepSeek",
        baseURL: "https://api.deepseek.com",
        deepseekThinking: true,
        ...options,
      });
  }
}
