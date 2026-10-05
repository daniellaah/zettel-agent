/**
 * Providers and models offered in settings. Plain data, so settings stay SDK-free.
 * Each default is the provider's cheapest model; users can pick a stronger one.
 */

export const PROVIDER_IDS = ["anthropic", "openai", "deepseek"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

interface ProviderInfo {
  label: string;
  /** Where to create an API key. */
  keyUrl: string;
  defaultModel: string;
  models: { id: string; label: string }[];
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: {
    label: "Anthropic (Claude)",
    keyUrl: "https://console.anthropic.com/settings/keys",
    defaultModel: "claude-haiku-4-5",
    models: [
      { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    ],
  },
  openai: {
    label: "OpenAI",
    keyUrl: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-6-luna",
    models: [
      { id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
      { id: "gpt-6-astra", label: "GPT-6 Astra" },
      { id: "gpt-6-luna", label: "GPT-6 Luna" },
    ],
  },
  deepseek: {
    label: "DeepSeek",
    keyUrl: "https://platform.deepseek.com/api_keys",
    defaultModel: "deepseek-flash",
    models: [
      { id: "deepseek-flash", label: "DeepSeek Flash (V4.1)" },
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
    ],
  },
};
