import { PROVIDER_IDS, PROVIDERS, type ProviderId } from "./agent/providers/catalog";

export const STAGES = ["fleeting", "literature", "permanent", "writing"] as const;
export type Stage = (typeof STAGES)[number];

export const RECORDING_MODES = ["off", "record", "replay"] as const;
export type RecordingMode = (typeof RECORDING_MODES)[number];

export interface PluginSettings {
  provider: ProviderId;
  retrievalMode: "lexical" | "hybrid";
  answerReviewMode: "structural" | "self-review";
  ollamaEndpoint: string;
  /** Offline record/replay of model responses; see agent/recording.ts. */
  recordingMode: RecordingMode;
  /** Model per provider, so switching providers back and forth keeps each choice. */
  models: Record<ProviderId, string>;
  /** IDs of API keys in Obsidian's secret storage; the keys themselves are never in data.json. */
  apiKeySecretIds: Record<ProviderId, string>;
  /** Vault-relative Zettelkasten folder. Empty means the whole vault. */
  zettelkastenRoot: string;
  /** Sub-folder of the root that holds each stage, matched case-insensitively. */
  stageFolders: Record<Stage, string>;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  provider: "deepseek",
  retrievalMode: "lexical",
  answerReviewMode: "structural",
  ollamaEndpoint: "http://127.0.0.1:11434",
  recordingMode: "off",
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
  // v0.1 stored a single Anthropic key and model.
  if (typeof data.apiKeySecretId === "string" && apiKeySecretIds.anthropic === "") {
    apiKeySecretIds.anthropic = data.apiKeySecretId;
  }
  if (typeof data.model === "string" && !isRecord(data.models)) models.anthropic = data.model;
  const provider = (PROVIDER_IDS as readonly unknown[]).includes(data.provider)
    ? (data.provider as ProviderId)
    : DEFAULT_SETTINGS.provider;

  const recordingMode = (RECORDING_MODES as readonly unknown[]).includes(data.recordingMode)
    ? (data.recordingMode as RecordingMode)
    : DEFAULT_SETTINGS.recordingMode;

  return {
    provider,
    answerReviewMode: data.answerReviewMode === "self-review" ? "self-review" : "structural",
    retrievalMode: data.retrievalMode === "hybrid" ? "hybrid" : "lexical",
    ollamaEndpoint: stringOr(data.ollamaEndpoint, DEFAULT_SETTINGS.ollamaEndpoint),
    recordingMode,
    models,
    apiKeySecretIds,
    zettelkastenRoot: normalizeFolder(
      stringOr(data.zettelkastenRoot, DEFAULT_SETTINGS.zettelkastenRoot),
    ),
    stageFolders,
  };
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
