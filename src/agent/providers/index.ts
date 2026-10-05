import type { FetchLike, ModelProvider } from "../provider";
import { AnthropicProvider } from "./anthropic";
import type { ProviderId } from "./catalog";
import { DeepSeekProvider } from "./chat-completions";
import { OpenAIResponsesProvider } from "./openai-responses";

/** `fetch` replaces the network in tests. */
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
      return new DeepSeekProvider(apiKey, model, options);
  }
}
