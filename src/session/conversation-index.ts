import type { ConversationRecord } from "./chat-session";

/** What the history list shows for a saved conversation, without loading it. */
export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  questions: number;
}

export function summarize(record: ConversationRecord): ConversationSummary {
  return {
    id: record.id,
    title: record.title,
    updatedAt: record.updatedAt,
    questions: record.items.filter((item) => item.kind === "user").length,
  };
}

/** Inserts or replaces a summary, keeping the list newest first. */
export function upsertSummary(
  list: readonly ConversationSummary[],
  summary: ConversationSummary,
): ConversationSummary[] {
  return [...list.filter((entry) => entry.id !== summary.id), summary].sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
  );
}

export function removeSummary(
  list: readonly ConversationSummary[],
  id: string,
): ConversationSummary[] {
  return list.filter((entry) => entry.id !== id);
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
