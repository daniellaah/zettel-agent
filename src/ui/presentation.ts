import type { StopReason } from "../agent/loop";
import type { EvidenceScope } from "../agent/tool-contract";
import type { AssistantItem, AssistantPart } from "../session/chat-session";
import type { AnswerProvenance, SourceView } from "../session/provenance";

export interface ChatConfiguration {
  model: string;
  provider: string;
  hasKey: boolean;
  folder: string;
  notes: number;
  indexed: boolean;
}

/** Local readiness only: a configured key does not prove a successful API connection. */
export function setupMessage(config: ChatConfiguration): string | null {
  if (!config.model.trim()) return "Choose a model in Settings to get started.";
  if (!config.hasKey) {
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
      `Cites sources the agent never read (${unknown.join(", ")}). Treat those claims as unsupported.`,
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

export interface AnswerNotice {
  tone: "info" | "warning" | "error";
  text: string;
}

const STOP_NOTES: Partial<Record<StopReason, string>> = {
  budget_exhausted: "Research budget reached; this answer uses what the agent found so far.",
  refusal: "The model declined to answer this.",
  max_tokens: "The response was cut off because it reached the length limit.",
  aborted: "Stopped.",
};

/** The notes under a finished answer, one per distinct problem, most serious first. */
export function answerNotices(
  item: Pick<
    AssistantItem,
    "stop" | "error" | "parts" | "citations" | "citationIssues" | "context"
  >,
): AnswerNotice[] {
  const notices: AnswerNotice[] = [];
  // A failed turn's error explains the failure; on any other turn it is a later problem,
  // such as the chat failing to save.
  if (item.stop === "error")
    notices.push({ tone: "error", text: item.error ?? "The turn failed." });
  else if (item.error) notices.push({ tone: "warning", text: item.error });
  const stopNote = item.stop ? STOP_NOTES[item.stop] : undefined;
  if (stopNote) notices.push({ tone: "info", text: stopNote });
  const { limited, failed } = researchPresentation(item.parts);
  if (limited && item.stop !== "budget_exhausted") {
    notices.push({
      tone: "info",
      text: "Research limit reached; this answer uses what the agent found so far. Expand Research details to see the limit.",
    });
  }
  if (failed && item.stop !== "error") {
    notices.push({
      tone: "warning",
      text: "Some research steps failed. Expand Research details to see what could not be retrieved.",
    });
  }
  if (item.context?.omittedTurns) {
    notices.push({
      tone: "info",
      text: "Earlier turns were left out of this request to fit the model's input limit; the full chat is still saved.",
    });
  }
  for (const text of citationWarnings(item.citationIssues ?? [], item.citations?.unknown ?? [])) {
    notices.push({ tone: "warning", text });
  }
  return notices;
}

/** How much of a source the model saw: read text, partial text, or no text at all. */
export type SeenTier = "read" | "partial" | "glimpse" | "unknown";

export interface SeenPresentation {
  label: string;
  tier: SeenTier;
  icon: string;
  /** Plain-language tooltip; never claims the source supports the answer. */
  description: string;
}

const SEEN: Record<EvidenceScope, SeenPresentation> = {
  body: {
    label: "Read",
    tier: "read",
    icon: "book-open",
    description: "The model read this section's full text.",
  },
  excerpt: {
    label: "Excerpt",
    tier: "partial",
    icon: "text-quote",
    description: "The model saw only a search excerpt, not the full section.",
  },
  "matched-line": {
    label: "Lines",
    tier: "partial",
    icon: "text-search",
    description: "The model saw only lines matching a search pattern.",
  },
  preview: {
    label: "Preview",
    tier: "partial",
    icon: "list",
    description: "The model saw only a short preview from a note list.",
  },
  outline: {
    label: "Headings",
    tier: "glimpse",
    icon: "list-tree",
    description: "The model saw only the note's headings, not its text.",
  },
  metadata: {
    label: "Properties",
    tier: "glimpse",
    icon: "tags",
    description: "The model saw only properties such as type or source, not the text.",
  },
  title: {
    label: "Title only",
    tier: "glimpse",
    icon: "heading",
    description: "The model saw only the title, not the text.",
  },
  graph: {
    label: "Links only",
    tier: "glimpse",
    icon: "git-fork",
    description: "The model saw only how this note links to others, not its text.",
  },
};

export function seenPresentation(
  source: Pick<SourceView, "seen" | "whole" | "attached">,
): SeenPresentation {
  if (source.seen === null)
    return {
      label: "Retrieved",
      tier: "unknown",
      icon: "file-text",
      description: "This chat was saved before the plugin recorded how much text the model saw.",
    };
  if (source.seen === "body" && source.attached)
    return {
      label: "Attached",
      tier: "read",
      icon: "paperclip",
      description: "You attached this note, so the model received its text.",
    };
  if (source.seen === "body" && !source.whole)
    return {
      ...SEEN.body,
      label: "Read in part",
      description: "The model read part of this section's text.",
    };
  return SEEN[source.seen];
}

/** The folded Sources line: how many notes are cited and how many were not read in full. */
export function sourcesSummary(provenance: AnswerProvenance): { label: string; unread: number } {
  const unread = new Set(
    provenance.cited
      .filter((source) => ["partial", "glimpse"].includes(seenPresentation(source).tier))
      .map((source) => source.path),
  ).size;
  const { notes } = provenance;
  return {
    label: notes === 0 ? "No notes cited" : `${notes} ${notes === 1 ? "note" : "notes"} cited`,
    unread,
  };
}

/** "just now", "5 min ago", "3 h ago", "yesterday", or a date. */
export function relativeTime(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return "yesterday";
  return iso.slice(0, 10);
}
