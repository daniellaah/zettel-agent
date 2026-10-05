import { z } from "zod";

import type { Corpus } from "../../retrieval/corpus";
import type { QueryVectors } from "../../retrieval/semantic-indexer";
import { hash, type ParsedNote, type Section } from "../../retrieval/markdown";
import type { EvidenceLedger } from "../evidence";
import {
  attribute,
  contractSummary,
  quoteData,
  ToolFault,
  type DeliveredSpan,
  type EvidenceScope,
  type ResultContract,
} from "../tool-contract";

/** Building blocks shared by the five tools: input schemas, delivery and note rendering. */

/** All five tools operate only on the accessible, read-only research corpus. */
export interface ToolContext {
  corpus: Corpus;
  ledger: EvidenceLedger;
  /** Remaining total output allowance, including contract, wrappers and metadata. */
  maxChars?: number;
  /** Encoded content allowance for the next provider request, after reserving wire overhead. */
  maxOutputBytes?: number;
  /** Vectors for this round's search queries, when semantic search is ready. */
  semantic?: QueryVectors;
}

export interface ToolOutcome {
  content: string;
  isError: boolean;
  summary: string;
  evidenceIds: string[];
  newEvidence: number;
  /** Optional only for historical saved traces and deliberately skipped calls. */
  contract?: ResultContract;
}

/** Output cap for one result when the caller sets no remaining allowance. */
export const MAX_OUTPUT = 32_000;

const stagesSchema = z
  .array(z.enum(["literature", "permanent", "writing"]))
  .optional()
  .describe("Research stages. Omitted or [] means all; fleeting is always excluded.");
const folderSchema = z.string().optional().describe("Only notes under this vault folder.");
const tagSchema = z.string().optional().describe("Only notes with this tag or a sub-tag.");
export const filters = { stages: stagesSchema, folder: folderSchema, tag: tagSchema };
export const cursorSchema = z
  .string()
  .max(100)
  .optional()
  .describe("Opaque continuation from the same query; restart after index changes.");
export const sourceSchema = z
  .string()
  .optional()
  .describe("Exact accessible source path for Obsidian-compatible link resolution.");

export interface ToolSpec<S extends z.ZodType> {
  name: string;
  description: string;
  schema: S;
  run(input: z.infer<S>, context: ToolContext): ToolOutcome;
}
export function defineTool<S extends z.ZodType>(spec: ToolSpec<S>): ToolSpec<z.ZodType> {
  return spec;
}

export class Delivery {
  private readonly ids: string[] = [];
  private readonly spans: DeliveredSpan[] = [];
  private fresh = 0;
  constructor(
    private readonly context: ToolContext,
    private readonly tool: string,
    private readonly effective: Record<string, unknown>,
    private readonly unit: ResultContract["returned"]["unit"],
  ) {}

  add(
    note: ParsedNote,
    section: Section,
    scope: EvidenceScope,
    text: string,
    span: Partial<Pick<DeliveredSpan, "start" | "end" | "line" | "wholeSection">> = {},
  ): string {
    const { evidence, isNew } = this.context.ledger.register({
      path: note.path,
      sectionId: section.id,
      headingPath: section.headingPath,
      contentHash: note.contentHash,
      linkPath: note.path.replace(/\.md$/i, ""),
    });
    if (!this.ids.includes(evidence.id)) {
      this.ids.push(evidence.id);
      if (isNew) this.fresh++;
    }
    this.spans.push({ ...evidence, scope, text: quoteData(text), wholeSection: false, ...span });
    return evidence.id;
  }
  hasSection(id: string): boolean {
    return this.spans.some((s) => s.sectionId === id);
  }
  metadata(note: ParsedNote, section: Section): void {
    const text = metadataText(note);
    if (text) this.add(note, section, "metadata", text);
  }
  finish(
    content: string,
    summary: string,
    count: number,
    /** Null when ranking has no exact candidate set (hybrid search ranks every section). */
    total: number | null,
    hasMore: boolean,
    truncated: boolean,
    cursor?: string,
  ): ToolOutcome {
    const metadataClipped = this.spans.some((s) => s.scope === "metadata" && s.text.endsWith("…"));
    const contract: ResultContract = {
      version: 1,
      tool: this.tool,
      scope: "accessible-research-corpus",
      effective: this.effective,
      revision: this.context.corpus.revision,
      returned: { count, unit: this.unit },
      candidates:
        total === null
          ? { count: null, semantics: "unknown" }
          : { count: total, semantics: "exact" },
      hasMore,
      truncated: truncated || metadataClipped,
      ...(cursor && { cursor }),
      exposures: this.spans,
    };
    const delivered = `${content}\n\n${contractSummary(contract)}`;
    contract.outputChars = delivered.length;
    return {
      content: delivered,
      summary,
      isError: false,
      evidenceIds: this.ids,
      newEvidence: this.fresh,
      contract,
    };
  }
}

export function resolveTarget(corpus: Corpus, target: string, source?: string): string {
  if (source && !corpus.get(source))
    throw new ToolFault("invalid-input", "source_path must be an accessible exact note path.");
  if (corpus.ambiguous(target, source))
    throw new ToolFault(
      "invalid-input",
      "Ambiguous note title. Use an exact path or accessible source_path.",
    );
  const path = corpus.resolve(target, source);
  if (!path)
    throw new ToolFault(
      "missing-target",
      `No note named ${target} in the accessible corpus. Use search or list for an exact path.`,
    );
  return path;
}
export function emptySection(note: ParsedNote): Section {
  return {
    id: hash(`${note.path}:empty`),
    headingPath: [],
    level: 0,
    startLine: 0,
    endLine: 0,
    text: "",
    links: [],
  };
}
export function metadataText(note: ParsedNote): string {
  return Object.keys(note.properties).length
    ? `Metadata: ${truncate(JSON.stringify(note.properties), 2000)}`
    : "";
}
export function noteBlock(
  corpus: Corpus,
  note: ParsedNote,
  header: string,
  parts: string[],
): string {
  const attrs = [
    `path="${attribute(note.path)}"`,
    `link="${attribute(`[[${corpus.ambiguous(note.title) || corpus.resolve(note.title) !== note.path ? note.path.replace(/\.md$/i, "") : note.title}]]`)}"`,
    `stage="${attribute(corpus.stage(note.path) ?? "none")}"`,
    ...(note.tags.length ? [`tags="${attribute(note.tags.join(", "))}"`] : []),
    ...(note.aliases.length ? [`aliases="${attribute(note.aliases.join(", "))}"`] : []),
  ];
  return `${header ? `${quoteData(header)}\n` : ""}<note ${attrs.join(" ")}>\n${metadataText(note) ? `${quoteData(metadataText(note))}\n\n` : ""}${parts.map(quoteData).join("\n\n")}\n</note>`;
}
export function sectionLabel(section: Section): string {
  return section.headingPath.length ? `§ ${section.headingPath.join(" › ")}` : "§ (top)";
}
export function queryKey(tool: string, effective: Record<string, unknown>): string {
  const query = Object.fromEntries(
    Object.entries(effective).filter(([key]) => !["cursor", "limit", "max_chars"].includes(key)),
  );
  // Schema parsing fixes key order. Page size may change on continuation.
  return JSON.stringify([tool, query]);
}
export function splitHeading(target: string): [string, string | undefined] {
  const cleaned = target.replace(/^!?\[\[|\]\]$/g, "").replace(/\|.*$/, "");
  const hashIndex = cleaned.indexOf("#");
  return hashIndex === -1
    ? [cleaned, undefined]
    : [cleaned.slice(0, hashIndex), cleaned.slice(hashIndex + 1).trim() || undefined];
}
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

export function openingText(note: ParsedNote, size: number): string {
  return truncate(
    note.sections
      .flatMap((section) => section.text.split("\n"))
      .filter((line) => !/^#{1,6}\s/.test(line))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
    size,
  );
}
