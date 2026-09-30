import type { ModelProvider } from "../provider";
import { AnthropicProvider } from "./anthropic";
import type { ProviderId } from "./catalog";
import { ChatCompletionsProvider } from "./chat-completions";
import { OpenAIResponsesProvider } from "./openai-responses";

export function createProvider(id: ProviderId, apiKey: string, model: string): ModelProvider {
  switch (id) {
    case "anthropic":
      return new AnthropicProvider(apiKey, model);
    case "openai":
      return new OpenAIResponsesProvider(apiKey, model);
    case "deepseek":
      return new ChatCompletionsProvider(apiKey, model, {
        provider: "deepseek",
        label: "DeepSeek",
        baseURL: "https://api.deepseek.com",
        deepseekThinking: true,
      });
  }
}
