import type { AssistantPart } from "../session/chat-session";
import type { RecordingMode } from "../settings";

export interface ChatConfiguration {
  model: string;
  provider: string;
  mode: RecordingMode;
  hasKey: boolean;
  folder: string;
  notes: number;
  indexed: boolean;
}

/** Local readiness only: a configured key does not prove a successful API connection. */
export function setupMessage(config: ChatConfiguration): string | null {
  if (!config.model.trim()) return "Choose a model in Settings to get started.";
  if (config.mode !== "replay" && !config.hasKey) {
    return `Add your ${config.provider} API key in Settings to get started.`;
  }
  if (!config.indexed) return "Loading research notes…";
  if (config.notes === 0) return "No research notes found. Check your research folder in Settings.";
  return null;
}

/** Keep the chronological research trace intact, with the final text outside its disclosure. */
export function researchPresentation(parts: readonly AssistantPart[]) {
  let lastResearch = parts.length - 1;
  while (lastResearch >= 0 && parts[lastResearch]?.kind === "text") lastResearch--;
  const tools = parts.filter((part) => part.kind === "tool");
  return {
    research: parts.slice(0, lastResearch + 1),
    answer: parts.slice(lastResearch + 1),
    steps: tools.length,
    limited: tools.some((part) => part.isError && part.summary?.includes("output-budget")),
    failed: tools.some((part) => part.isError && !part.summary?.includes("output-budget")),
  };
}

const TOOL_ACTIVITY: Record<string, string> = {
  search: "Searching your notes…",
  match: "Finding exact passages…",
  read: "Reading a note…",
  links: "Following links…",
  list: "Listing notes…",
};

/** What a running turn is doing right now, for the folded research line. */
export function researchActivity(parts: readonly AssistantPart[]): string {
  const last = parts.at(-1);
  if (last?.kind === "thinking") return "Thinking…";
  if (last?.kind === "tool" && last.summary === null) {
    return TOOL_ACTIVITY[last.name] ?? "Researching your notes…";
  }
  return "Researching your notes…";
}

/**
 * Citation warnings for a finished answer, one line per distinct problem. An empty answer
 * has no citations to warn about, and an unknown ID is named once instead of also being
 * reported as generally "undelivered".
 */
export function citationWarnings(
  issues: readonly { code: string }[],
  unknown: readonly string[],
): string[] {
  const warnings: string[] = [];
  const has = (code: string) => issues.some((issue) => issue.code === code);
  if (unknown.length > 0) {
    warnings.push(
      `Cited evidence that was never retrieved: ${unknown.join(", ")}. Treat those claims as unsupported.`,
    );
  } else if (has("undelivered-citation")) {
    warnings.push("Some citations have no source text behind them. Ask again to retrieve it.");
  }
  if (has("stale-evidence")) {
    warnings.push(
      "Some cited notes changed after they were read. Ask again to use the current text.",
    );
  }
  return warnings;
}
