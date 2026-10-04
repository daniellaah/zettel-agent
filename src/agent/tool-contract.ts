import type { Evidence } from "./evidence";
import type { Corpus } from "../retrieval/corpus";
import { hash } from "../retrieval/markdown";

export type EvidenceScope =
  "title" | "metadata" | "preview" | "excerpt" | "body" | "matched-line" | "graph" | "outline";

/** One actually delivered span, never an inferred whole-body exposure. */
export interface DeliveredSpan extends Evidence {
  scope: EvidenceScope;
  /** Exact escaped model-visible data; quotation validation needs no corpus expansion. */
  text: string;
  /** Character offsets within the original section; end is exclusive. */
  start?: number;
  end?: number;
  line?: number;
  wholeSection: boolean;
}

export interface ResultContract {
  version: 1;
  tool: string;
  scope: "accessible-research-corpus";
  effective: Record<string, unknown>;
  revision: string;
  returned: { count: number; unit: "notes" | "sections" | "lines" | "neighbors" };
  candidates: { count: number | null; semantics: "exact" | "unknown" };
  hasMore: boolean;
  truncated: boolean;
  cursor?: string;
  exposures: DeliveredSpan[];
  /** Exact model-visible size, including wrappers and compact summary. */
  outputChars?: number;
  error?: {
    code:
      | "invalid-input"
      | "missing-target"
      | "stale-reference"
      | "invalid-cursor"
      | "invalid-regex"
      | "output-budget"
      | "tool-failed";
    nextAction: string;
  };
}

interface CursorEntry {
  revision: string;
  key: string;
  position: number;
}
const cursors = new WeakMap<Corpus, Map<string, CursorEntry>>();

/**
 * Opaque bounded session cursors: model input cannot forge offsets or source bindings, because
 * only issued tokens resolve. Tokens depend only on query, position and revision, so the same
 * page always gets the same token and recorded requests replay exactly in any process.
 */
export function continuation(corpus: Corpus, key: string, position: number): string {
  let entries = cursors.get(corpus);
  if (!entries) cursors.set(corpus, (entries = new Map<string, CursorEntry>()));
  const token = `c1-${hash(`${key}:${position}:${corpus.revision}`)}`;
  entries.set(token, { revision: corpus.revision, key, position });
  if (entries.size > 512) entries.delete(entries.keys().next().value!);
  return token;
}

export function cursorPosition(corpus: Corpus, key: string, cursor?: string): number {
  if (!cursor) return 0;
  const entry = cursors.get(corpus)?.get(cursor);
  if (!entry || entry.key !== key || entry.revision !== corpus.revision)
    throw new ToolFault(
      "invalid-cursor",
      "Invalid, expired or stale cursor. Restart this query without cursor.",
    );
  return entry.position;
}

export class ToolFault extends Error {
  constructor(
    readonly code: NonNullable<ResultContract["error"]>["code"],
    message: string,
  ) {
    super(message);
  }
}

/** Escape all wrapper closures in body data while retaining readable Markdown. */
export function quoteData(text: string): string {
  return text.replace(/<\/(note|note_lines|selection|context)\b/gi, "<\\/$1");
}

/** Attribute values cannot inject tags, attributes or role boundaries. */
export function attribute(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "&#10;")
    .replace(/\r/g, "&#13;");
}

/** Compact summary contains no arbitrary note data or evidence markers. */
export function contractSummary(result: ResultContract): string {
  const scopes = [...new Set(result.exposures.map((span) => `${span.id}:${span.scope}`))].join(",");
  return `Result v${result.version}: ${result.tool}; scope=${result.scope}; revision=${result.revision}; returned=${result.returned.count} ${result.returned.unit}; candidates=${result.candidates.count ?? "unknown"} (${result.candidates.semantics}); hasMore=${result.hasMore}; truncated=${result.truncated}; evidenceScopes=${scopes || "none"}${result.cursor ? `; cursor=${result.cursor}` : ""}${result.error ? `; error=${result.error.code}` : ""}.\nEffective input (untrusted query data): <note_lines>${quoteData(JSON.stringify(result.effective))}</note_lines>`;
}
