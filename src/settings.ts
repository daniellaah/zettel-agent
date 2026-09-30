export const STAGES = ["fleeting", "literature", "permanent", "writing"] as const;
export type Stage = (typeof STAGES)[number];

export const MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
] as const;

export interface PluginSettings {
  /** ID of the Anthropic API key in Obsidian's secret storage; the key itself is never in data.json. */
  apiKeySecretId: string;
  model: string;
  /** Vault-relative Zettelkasten folder. Empty means the whole vault. */
  zettelkastenRoot: string;
  /** Sub-folder of the root that holds each stage, matched case-insensitively. */
  stageFolders: Record<Stage, string>;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  apiKeySecretId: "",
  model: "claude-opus-5-5",
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
  return {
    apiKeySecretId: stringOr(data.apiKeySecretId, DEFAULT_SETTINGS.apiKeySecretId),
    model: stringOr(data.model, DEFAULT_SETTINGS.model),
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
