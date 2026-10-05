import { PROVIDER_IDS, PROVIDERS, type ProviderId } from "./agent/providers/catalog";
import { DEFAULT_EMBEDDING_MODEL } from "./retrieval/embedding-models";
import { DEFAULT_OLLAMA_URL } from "./retrieval/ollama";

export const STAGES = ["fleeting", "literature", "permanent", "writing"] as const;
export type Stage = (typeof STAGES)[number];

export interface PluginSettings {
  provider: ProviderId;
  /** Model per provider, so switching providers back and forth keeps each choice. */
  models: Record<ProviderId, string>;
  /** IDs of API keys in Obsidian's secret storage; the keys themselves are never in data.json. */
  apiKeySecretIds: Record<ProviderId, string>;
  /** Vault-relative Zettelkasten folder. Empty means the whole vault. */
  zettelkastenRoot: string;
  /** Sub-folder of the root that holds each stage, matched case-insensitively. */
  stageFolders: Record<Stage, string>;
  /**
   * Hybrid search: embeddings from Ollama on this computer, fused with keywords. Search
   * falls back to keywords alone while Ollama is unavailable or the index is incomplete.
   */
  semanticSearch: boolean;
  ollamaUrl: string;
  embeddingModel: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  provider: "deepseek",
  models: {
    anthropic: PROVIDERS.anthropic.defaultModel,
    openai: PROVIDERS.openai.defaultModel,
    deepseek: PROVIDERS.deepseek.defaultModel,
  },
  apiKeySecretIds: { anthropic: "", openai: "", deepseek: "" },
  zettelkastenRoot: "",
  stageFolders: {
    fleeting: "Fleeting",
    literature: "Literature",
    permanent: "Permanent",
    writing: "Writing",
  },
  semanticSearch: true,
  ollamaUrl: DEFAULT_OLLAMA_URL,
  embeddingModel: DEFAULT_EMBEDDING_MODEL,
};

/** Merges stored data over defaults, ignoring fields of the wrong type. */
export function resolveSettings(stored: unknown): PluginSettings {
  const data = isRecord(stored) ? stored : {};
  const stageData = isRecord(data.stageFolders) ? data.stageFolders : {};
  const stageFolders = { ...DEFAULT_SETTINGS.stageFolders };
  for (const stage of STAGES) {
    const folder = stageData[stage];
    if (typeof folder === "string") stageFolders[stage] = normalizeFolder(folder);
  }
  const storedModels = isRecord(data.models) ? data.models : {};
  const storedKeys = isRecord(data.apiKeySecretIds) ? data.apiKeySecretIds : {};
  const models = {} as Record<ProviderId, string>;
  const apiKeySecretIds = {} as Record<ProviderId, string>;
  for (const id of PROVIDER_IDS) {
    models[id] =
      stringOr(storedModels[id], PROVIDERS[id].defaultModel) || PROVIDERS[id].defaultModel;
    apiKeySecretIds[id] = stringOr(storedKeys[id], "");
  }
  const provider = (PROVIDER_IDS as readonly unknown[]).includes(data.provider)
    ? (data.provider as ProviderId)
    : DEFAULT_SETTINGS.provider;

  return {
    provider,
    models,
    apiKeySecretIds,
    zettelkastenRoot: normalizeFolder(
      stringOr(data.zettelkastenRoot, DEFAULT_SETTINGS.zettelkastenRoot),
    ),
    stageFolders,
    semanticSearch:
      typeof data.semanticSearch === "boolean"
        ? data.semanticSearch
        : DEFAULT_SETTINGS.semanticSearch,
    ollamaUrl: stringOr(data.ollamaUrl, "").trim() || DEFAULT_SETTINGS.ollamaUrl,
    embeddingModel: stringOr(data.embeddingModel, "").trim() || DEFAULT_SETTINGS.embeddingModel,
  };
}

/** True when embedding requests stay on this computer. */
export function isLocalUrl(url: string): boolean {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Trims whitespace and leading/trailing slashes: " /02-Zettelkasten/ " -> "02-Zettelkasten". */
export function normalizeFolder(folder: string): string {
  return folder.trim().replace(/^\/+|\/+$/g, "");
}

export function isInZettelkasten(path: string, root: string): boolean {
  return root === "" || path === root || path.startsWith(`${root}/`);
}

/** Stage of a note from its folder, or null when it sits outside every stage folder. */
export function stageForPath(path: string, settings: PluginSettings): Stage | null {
  const root = settings.zettelkastenRoot;
  if (!isInZettelkasten(path, root)) return null;
  const relative = root === "" ? path : path.slice(root.length + 1);
  const segments = relative.split("/");
  if (segments.length < 2) return null;
  const folder = segments[0]!.toLowerCase();
  return STAGES.find((stage) => settings.stageFolders[stage].toLowerCase() === folder) ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}
