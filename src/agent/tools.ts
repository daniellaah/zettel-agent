import { z } from "zod";

import type { PreparedSearch, SearchPort } from "../retrieval/local-search";
import type { Corpus } from "../retrieval/corpus";
import { hash, sectionSubtree, type ParsedNote, type Section } from "../retrieval/markdown";
import { EvidenceLedger } from "./evidence";
import type { ToolDefinition } from "./provider";
import {
  attribute,
  continuation,
  contractSummary,
  cursorPosition,
  quoteData,
  ToolFault,
  type DeliveredSpan,
  type EvidenceScope,
  type ResultContract,
} from "./tool-contract";

/** All five tools operate only on the accessible, read-only research corpus. */
export interface ToolContext {
  corpus: Corpus;
  ledger: EvidenceLedger;
  search?: SearchPort;
  preparedSearch?: PreparedSearch;
  /** Remaining total output allowance, including contract, wrappers and metadata. */
  maxChars?: number;
  /** Encoded content allowance for the next provider request, after reserving wire overhead. */
  maxOutputBytes?: number;
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

const EXCERPT_CHARS = 600;
const PREVIEW_CHARS = 200;
const READ_CHARS = 12_000;
const MAX_OUTPUT = 32_000;
const MAX_REGEX_LENGTH = 200;
const stagesSchema = z
  .array(z.enum(["literature", "permanent", "writing"]))
  .optional()
  .describe("Research stages. Omitted or [] means all; fleeting is always excluded.");
const folderSchema = z.string().optional().describe("Only notes under this vault folder.");
const tagSchema = z.string().optional().describe("Only notes with this tag or a sub-tag.");
const filters = { stages: stagesSchema, folder: folderSchema, tag: tagSchema };
const cursorSchema = z
  .string()
  .max(100)
  .optional()
  .describe("Opaque continuation from the same query; restart after index changes.");
const sourceSchema = z
  .string()
  .optional()
  .describe("Exact accessible source path for Obsidian-compatible link resolution.");
const searchInput = z
  .object({
    query: z.string().min(1).max(2000).describe("Keywords in Chinese or English."),
    ...filters,
    limit: z.number().int().min(1).max(20).optional().describe("Total section limit (default 8)."),
    per_note: z.number().int().min(1).max(5).optional().describe("Sections per note (default 1)."),
  })
  .strict();
const matchInput = z
  .object({
    pattern: z.string().min(1).max(MAX_REGEX_LENGTH),
    regex: z
      .boolean()
      .optional()
      .describe(
        "Fixed-width regex subset: literals, classes, dot, anchors, character escapes; no groups, alternation, quantifiers or backreferences.",
      ),
    case_sensitive: z.boolean().optional(),
    ...filters,
    target: z.string().optional().describe("Optional exact note path or unambiguous title."),
    context_lines: z.number().int().min(0).max(3).optional(),
    limit: z.number().int().min(1).max(50).optional(),
    cursor: cursorSchema,
  })
  .strict();
const readInput = z
  .object({
    target: z
      .string()
      .min(1)
      .max(2000)
      .describe(
        "E3, exact path/title, or path#Heading. An E id expands its section/subsections; a bare path reads the body.",
      ),
    mode: z.enum(["body", "outline"]).optional(),
    section_id: z
      .string()
      .optional()
      .describe("Select an exact section from outline, including repeated headings."),
    source_path: sourceSchema,
    max_chars: z
      .number()
      .int()
      .min(100)
      .max(READ_CHARS)
      .optional()
      .describe("Body characters per page, wrappers/metadata separately bounded."),
    cursor: cursorSchema,
  })
  .strict();
const linksInput = z
  .object({
    target: z.string().min(1).max(2000),
    source_path: sourceSchema,
    depth: z.union([z.literal(1), z.literal(2)]).optional(),
    direction: z.enum(["both", "outgoing", "incoming"]).optional(),
    ...filters,
    limit: z.number().int().min(1).max(100).optional(),
    cursor: cursorSchema,
  })
  .strict();
const listInput = z
  .object({
    ...filters,
    orphans_only: z.boolean().optional(),
    connection: z.enum(["orphan", "no-backlinks", "no-outlinks"]).optional(),
    preview: z.boolean().optional(),
    limit: z.number().int().min(1).max(200).optional(),
    cursor: cursorSchema,
  })
  .strict();

interface ToolSpec<S extends z.ZodType> {
  name: string;
  description: string;
  schema: S;
  run(input: z.infer<S>, context: ToolContext): ToolOutcome;
}
function defineTool<S extends z.ZodType>(spec: ToolSpec<S>): ToolSpec<z.ZodType> {
  return spec;
}

export const TOOLS: ToolSpec<z.ZodType>[] = [
  defineTool({
    name: "search",
    schema: searchInput,
    description:
      "Ranked section excerpts (BM25F, or configured local hybrid retrieval); scores are ranking, not entailment. Default one section per note; per_note can expand coverage. Read excerpts before relying on omitted details.",
    run: (input, context) => {
      const { corpus } = context;
      const effective = {
        ...input,
        limit: input.limit ?? 8,
        per_note: input.per_note ?? 1,
        mode: context.preparedSearch?.mode ?? "lexical",
        ...(context.preparedSearch?.fallback && { fallback: context.preparedSearch.fallback }),
        ...(context.preparedSearch?.mode === "hybrid" && { candidateDepth: 50, rrfConstant: 60 }),
      };
      if (context.preparedSearch && context.preparedSearch.revision !== corpus.revision)
        throw new ToolFault("tool-failed", "Research corpus changed; retry search.");
      const hits =
        context.preparedSearch?.hits ??
        corpus.search(input.query, {
          ...input,
          perNote: effective.per_note,
          limit: Number.MAX_SAFE_INTEGER,
        });
      const page = hits.slice(0, effective.limit);
      const delivery = new Delivery(context, "search", effective, "sections");
      let clipped = false;
      const blocks = page.map((hit) => {
        const note = corpus.get(hit.path)!;
        const section = note.sections.find((s) => s.id === hit.sectionId)!;
        const window = excerptWindow(section.text, hit.matchedTerms, EXCERPT_CHARS);
        const excerpt = window.text;
        const id = delivery.add(note, section, "excerpt", excerpt, {
          wholeSection: excerpt === section.text,
          start: window.start,
          end: window.end,
        });
        clipped ||= excerpt !== section.text;
        delivery.metadata(note, section);
        return noteBlock(
          corpus,
          note,
          `[${id}] matched: ${hit.matchedTerms.join(", ")} (terms found in note; ${effective.mode} ranking score=${hit.score.toFixed(3)})`,
          [`${sectionLabel(section)}\n${excerpt}`],
        );
      });
      return delivery.finish(
        (context.preparedSearch?.fallback
          ? `<note_lines>${quoteData(`Local hybrid unavailable; using lexical search. ${context.preparedSearch.fallback}`)}</note_lines>\n`
          : "") +
          (blocks.join("\n\n") ||
            `No notes match these keywords in the specified research scope. Try synonyms or fewer filters.`),
        `search "${input.query}" → ${page.length} section${page.length === 1 ? "" : "s"}${context.preparedSearch ? ` (${effective.mode}${context.preparedSearch.fallback ? "; fallback" : ""})` : ""}`,
        page.length,
        hits.length,
        hits.length > page.length,
        clipped,
        undefined,
        context.preparedSearch?.candidateSemantics ?? "exact",
      );
    },
  }),
  defineTool({
    name: "match",
    schema: matchInput,
    description:
      "Exact literal or bounded regex line search with shared filters, line identities, optional context and continuation. Exhaustion describes only this query's scope.",
    run: (input, context) => {
      const { corpus } = context;
      const matcher = boundedMatcher(
        input.pattern,
        input.regex ?? false,
        input.case_sensitive ?? false,
      );
      const target = input.target ? resolveTarget(corpus, input.target) : undefined;
      const effective = {
        ...input,
        regex: input.regex ?? false,
        case_sensitive: input.case_sensitive ?? false,
        context_lines: input.context_lines ?? 0,
        limit: input.limit ?? 20,
        ...(target && { target }),
      };
      const key = queryKey("match", effective);
      const offset = cursorPosition(corpus, key, input.cursor);
      const matches: {
        note: ParsedNote;
        section: Section;
        line: number;
        text: string;
        start: number;
        end: number;
        clipped: boolean;
      }[] = [];
      for (const path of corpus.paths()) {
        if ((target && path !== target) || !corpus.eligible(path, input)) continue;
        const note = corpus.get(path)!;
        for (const section of note.sections) {
          const lines = section.text.split("\n");
          let start = 0;
          lines.forEach((line, i) => {
            if (matcher.test(line)) {
              const from = Math.max(0, i - effective.context_lines);
              const to = Math.min(lines.length, i + effective.context_lines + 1);
              matches.push({
                note,
                section,
                line: section.startLine + i + 1,
                text: lines
                  .slice(from, to)
                  .map((text, j) => `${section.startLine + from + j + 1}: ${truncate(text, 300)}`)
                  .join("\n"),
                start,
                end: start + Math.min(line.length, 300),
                clipped: lines.slice(from, to).some((line) => line.length > 300),
              });
            }
            start += line.length + 1;
          });
        }
      }
      const page = matches.slice(offset, offset + effective.limit);
      const delivery = new Delivery(context, "match", effective, "lines");
      const rows = page.map(({ note, section, line, text, start, end }) => {
        const id = delivery.add(note, section, "matched-line", text, { start, end, line });
        return `[${id}] ${note.path}:${line} (${sectionLabel(section)})\n  ${text}`;
      });
      const more = offset + page.length < matches.length;
      return delivery.finish(
        `<note_lines>\n${quoteData(rows.join("\n") || "No line matches in these filters.")}\n</note_lines>`,
        `match ${JSON.stringify(input.pattern)} → ${page.length}/${matches.length} lines${more ? "; more" : ""}`,
        page.length,
        matches.length,
        more,
        more || page.some((row) => row.clipped),
        more ? continuation(corpus, key, offset + page.length) : undefined,
      );
    },
  }),
  defineTool({
    name: "read",
    schema: readInput,
    description:
      "Bounded body or outline pages with exact section IDs and revision-bound continuation. Title/outline/metadata evidence is distinct from body evidence. Continue until required text is complete.",
    run: (input, context) => {
      const { corpus, ledger } = context;
      const target = input.target.trim();
      const isId = /^E\d+$/i.test(target);
      const evidence = isId ? ledger.get(target) : undefined;
      if (isId && !evidence)
        throw new ToolFault(
          "stale-reference",
          `Unknown evidence id ${target}. Search or list a current target.`,
        );
      const [pathPart, heading] = evidence ? [evidence.path, undefined] : splitHeading(target);
      const path = evidence ? evidence.path : resolveTarget(corpus, pathPart, input.source_path);
      const note = corpus.get(path);
      if (!note)
        throw new ToolFault(
          evidence ? "stale-reference" : "missing-target",
          "Target is no longer accessible. Search or list its current exact path.",
        );
      let sections = note.sections;
      const chosenId = input.section_id ?? evidence?.sectionId;
      if (chosenId) {
        sections = sectionSubtree(note, chosenId);
        if (!sections.length && !(note.sections.length === 0 && chosenId === emptySection(note).id))
          throw new ToolFault(
            "stale-reference",
            "The referenced section no longer exists. Read the current note outline and select a current section_id.",
          );
      } else if (heading) {
        const starts = note.sections.filter(
          (s) =>
            s.headingPath.at(-1)?.toLowerCase() === heading.toLowerCase() ||
            s.headingPath.join(" › ").toLowerCase() === heading.toLowerCase(),
        );
        if (!starts.length)
          throw new ToolFault(
            "missing-target",
            `Heading not found. Headings: ${note.sections
              .map((s) => s.headingPath.at(-1))
              .filter(Boolean)
              .join(" | ")}. Read outline.`,
          );
        if (starts.length > 1)
          throw new ToolFault(
            "invalid-input",
            "Ambiguous heading. Read outline and select section_id.",
          );
        sections = sectionSubtree(note, starts[0]!.id);
      }
      const effective = {
        target: path,
        mode: input.mode ?? "body",
        section_id: chosenId ?? (heading ? sections[0]?.id : undefined),
        max_chars: input.max_chars ?? READ_CHARS,
      };
      const key = queryKey("read", { ...effective, contentHash: note.contentHash });
      const offset = cursorPosition(corpus, key, input.cursor);
      const delivery = new Delivery(context, "read", effective, "sections");
      const changed =
        evidence && evidence.contentHash !== note.contentHash
          ? `Note changed since ${evidence.id}; current revision follows. Old citations retain their old revision.\n`
          : "";
      const bodySize = sections.reduce((sum, section) => sum + section.text.length, 0);
      const markupRatio = 2 + (sections.length * 30) / Math.max(1, bodySize);
      const allowance = Math.max(
        0,
        Math.min(
          effective.max_chars,
          Math.floor(((context.maxChars ?? MAX_OUTPUT) - 6000) / markupRatio),
        ),
      );
      if (allowance < 100)
        throw new ToolFault(
          "output-budget",
          "Insufficient output budget. Finish using delivered evidence or begin a new turn.",
        );
      const parts: string[] = [];
      let position = offset;
      let returned = 0;
      let more: boolean;
      if (effective.mode === "outline") {
        let size = 0;
        for (const section of sections.slice(offset)) {
          const text = `${section.id}: ${sectionLabel(section)} (lines ${section.startLine + 1}–${section.endLine})`;
          if (size + text.length > allowance && returned) break;
          if (text.length > allowance)
            throw new ToolFault(
              "output-budget",
              "Heading exceeds page allowance. Increase max_chars or use exact section_id.",
            );
          const id = delivery.add(note, section, "outline", text);
          parts.push(`[${id}] ${text}`);
          size += text.length;
          returned++;
        }
        position += returned;
        more = position < sections.length;
      } else {
        // Canonical body stream uses a single newline between parsed sections. Each page
        // exposes exact section-relative offsets, including oversized single sections.
        const total =
          sections.reduce((sum, s) => sum + s.text.length, 0) + Math.max(0, sections.length - 1);
        const end = Math.min(total, offset + allowance);
        let base = 0;
        for (const section of sections) {
          const start = Math.max(0, offset - base);
          const stop = Math.min(section.text.length, end - base);
          if (stop > start) {
            const text = section.text.slice(start, stop);
            const id = delivery.add(note, section, "body", text, {
              start,
              end: stop,
              wholeSection: start === 0 && stop === section.text.length,
            });
            parts.push(`[${id}]\n${text}`);
            returned++;
          }
          base += section.text.length + 1;
        }
        position = end;
        more = end < total;
      }
      if (!sections.length) {
        const id = delivery.add(note, emptySection(note), "title", "Empty note body.");
        parts.push(`[${id}] Empty note body.`);
      }
      // Metadata is delivered once per ID, with its own exposure scope.
      for (const section of sections.filter((s) => delivery.hasSection(s.id)))
        delivery.metadata(note, section);
      if (!sections.length) delivery.metadata(note, emptySection(note));
      return delivery.finish(
        noteBlock(corpus, note, changed, parts),
        `read ${note.title}${heading ? `#${heading}` : ""} (${effective.mode}, ${returned} sections${more ? "; more" : ""})`,
        returned,
        sections.length,
        more,
        more,
        more ? continuation(corpus, key, position) : undefined,
      );
    },
  }),
  defineTool({
    name: "links",
    schema: linksInput,
    description:
      "Resolved connectivity in the research corpus; explicit outgoing/backlink counts and orphan state. Direction/depth/filters bound traversal and neighbors are paginated. Distance two is never a direct edge or semantic agreement.",
    run: (input, context) => {
      const { corpus } = context;
      const path = resolveTarget(corpus, input.target, input.source_path);
      const graph = corpus.graph();
      const effective = {
        ...input,
        target: path,
        depth: input.depth ?? 1,
        direction: input.direction ?? "both",
        limit: input.limit ?? 30,
      };
      const key = queryKey("links", effective);
      const offset = cursorPosition(corpus, key, input.cursor);
      const outgoing = graph.outlinks(path);
      const incoming = graph.backlinks(path);
      const unresolved = graph.unresolvedLinks(path);
      const neighbors = [...graph.neighborhood(path, effective.depth, effective.direction)]
        .filter(([p]) => corpus.eligible(p, input))
        .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
      const page = neighbors.slice(offset, offset + effective.limit);
      const delivery = new Delivery(context, "links", effective, "neighbors");
      const root = corpus.get(path)!;
      const rootSection = root.sections[0] ?? emptySection(root);
      const facts = `Outgoing (${outgoing.length}); Backlinks (${incoming.length}); isOrphan=${graph.isOrphan(path)}; unresolved (${unresolved.length}): ${unresolved.join(", ")}`;
      const id = delivery.add(root, rootSection, "graph", facts);
      const rows = page.map(([p, distance]) => {
        const note = corpus.get(p)!;
        const relation =
          distance === 2
            ? "Two links away"
            : [outgoing.includes(p) ? "Outgoing" : "", incoming.includes(p) ? "Backlink" : ""]
                .filter(Boolean)
                .join(" + ");
        const text = `${note.title} (${corpus.stage(p) ?? "—"}) ${p}; ${relation}; distance=${distance} from ${path}`;
        const neighborId = delivery.add(
          note,
          note.sections[0] ?? emptySection(note),
          "graph",
          text,
        );
        return `- [${neighborId}] ${text}`;
      });
      // The root also exposes the displayed edges; omitted neighbors are never registered.
      if (rows.length) delivery.add(root, rootSection, "graph", rows.join("\n"));
      const more = offset + page.length < neighbors.length;
      return delivery.finish(
        `<note_lines>\n${quoteData(`Note: [${id}] ${root.title} (${path})\n${facts}\nGraph scope: accessible research corpus only; edges establish connectivity, not support or contradiction.\n${rows.join("\n")}`)}\n</note_lines>`,
        `links ${root.title} → ${outgoing.length} out, ${incoming.length} in`,
        page.length,
        neighbors.length,
        more,
        more,
        more ? continuation(corpus, key, offset + page.length) : undefined,
      );
    },
  }),
  defineTool({
    name: "list",
    schema: listInput,
    description:
      "Stable path-ordered filtered survey with exact total, degree counts and continuation. Optional previews remain previews. Connection filters distinguish orphan/no-backlinks/no-outlinks.",
    run: (input, context) => {
      const { corpus } = context;
      const graph = corpus.graph();
      const effective = { ...input, preview: input.preview ?? false, limit: input.limit ?? 50 };
      const key = queryKey("list", effective);
      const offset = cursorPosition(corpus, key, input.cursor);
      const paths = corpus
        .paths()
        .filter(
          (path) =>
            corpus.eligible(path, input) &&
            (!input.orphans_only || graph.isOrphan(path)) &&
            (input.connection !== "orphan" || graph.isOrphan(path)) &&
            (input.connection !== "no-backlinks" || graph.backlinks(path).length === 0) &&
            (input.connection !== "no-outlinks" || graph.outlinks(path).length === 0),
        );
      const page = paths.slice(offset, offset + effective.limit);
      const delivery = new Delivery(context, "list", effective, "notes");
      const rows = page.map((path) => {
        const note = corpus.get(path)!;
        const section = note.sections[0] ?? emptySection(note);
        const text = `${note.title} (${corpus.stage(path) ?? "—"}, ${graph.outlinks(path).length} out, ${graph.backlinks(path).length} in)${note.tags.length ? ` #${note.tags.join(" #")}` : ""} ${path}`;
        const opening = input.preview ? openingText(note, PREVIEW_CHARS) : "";
        const id = delivery.add(note, section, "title", text);
        if (opening) delivery.add(note, section, "preview", opening);
        // Degree facts have a structural exposure separate from the title.
        delivery.add(note, section, "graph", text);
        delivery.metadata(note, section);
        return `- [${id}] ${text}${opening ? `\n  ${opening}` : ""}${metadataText(note) ? `\n  ${metadataText(note)}` : ""}`;
      });
      const more = offset + page.length < paths.length;
      return delivery.finish(
        `<note_lines>\n${quoteData(rows.join("\n") || "No notes match these filters.")}\n</note_lines>`,
        `list → ${page.length}/${paths.length} notes (${input.preview ? "previews" : "titles"}${more ? "; more" : ""})`,
        page.length,
        paths.length,
        more,
        more ||
          page.some(
            (path) => input.preview && openingText(corpus.get(path)!, PREVIEW_CHARS).endsWith("…"),
          ),
        more ? continuation(corpus, key, offset + page.length) : undefined,
      );
    },
  }),
];

export function toolDefinitions(): ToolDefinition[] {
  return TOOLS.map((tool) => {
    const schema = z.toJSONSchema(tool.schema) as Record<string, unknown>;
    delete schema.$schema;
    return { name: tool.name, description: tool.description, inputSchema: schema };
  });
}

/** Evidence registration is transactional: undelivered/over-budget IDs never enter the ledger. */
export function executeTool(name: string, input: unknown, context: ToolContext): ToolOutcome {
  const tool = TOOLS.find((t) => t.name === name);
  const parsed = tool?.schema.safeParse(input);
  const maxChars = Math.max(0, context.maxChars ?? MAX_OUTPUT);
  const fail = (
    code: NonNullable<ResultContract["error"]>["code"],
    message: string,
  ): ToolOutcome => {
    const contract: ResultContract = {
      version: 1,
      tool: name,
      scope: "accessible-research-corpus",
      effective: parsed?.success ? (parsed.data as Record<string, unknown>) : {},
      revision: context.corpus.revision,
      returned: { count: 0, unit: "notes" },
      candidates: { count: null, semantics: "unknown" },
      hasMore: false,
      truncated: false,
      exposures: [],
      error: { code, nextAction: message },
    };
    const text = `<note_lines>${quoteData(message)}</note_lines>\n${contractSummary(contract)}`;
    const content =
      text.length <= maxChars &&
      new TextEncoder().encode(JSON.stringify(text)).length <= (context.maxOutputBytes ?? Infinity)
        ? text
        : "Output budget.".slice(
            0,
            Math.min(maxChars, Math.max(0, (context.maxOutputBytes ?? Infinity) - 2)),
          );
    contract.outputChars = content.length;
    return {
      content,
      isError: true,
      summary: `${name} → ${code}`,
      evidenceIds: [],
      newEvidence: 0,
      contract,
    };
  };
  if (!tool || !parsed?.success)
    return fail(
      "invalid-input",
      tool
        ? `Invalid input: ${parsed && !parsed.success ? z.prettifyError(parsed.error) : ""}. Retry with tool schema.`
        : `Unknown tool ${name}. Use one of the five read-only tools.`,
    );
  const ledger = new EvidenceLedger(context.ledger.entries());
  try {
    const result = tool.run(parsed.data, { ...context, ledger });
    if (result.content.length > maxChars)
      return fail(
        "output-budget",
        "Result exceeds remaining output budget. Reduce limit/max_chars, use a specific section, or begin a new turn.",
      );
    if (
      new TextEncoder().encode(JSON.stringify(result.content)).length >
      (context.maxOutputBytes ?? Infinity)
    )
      return fail(
        "output-budget",
        "Result exceeds remaining input allowance. Reduce limit/max_chars or read a specific section.",
      );
    for (const entry of ledger.entries().slice(context.ledger.size)) {
      context.ledger.register({
        path: entry.path,
        sectionId: entry.sectionId,
        headingPath: entry.headingPath,
        contentHash: entry.contentHash,
        ...(entry.linkPath && { linkPath: entry.linkPath }),
      });
    }
    return result;
  } catch (error) {
    return fail(
      error instanceof ToolFault ? error.code : "tool-failed",
      error instanceof Error ? error.message : "Tool failed. Retry with a narrower query.",
    );
  }
}

/** Async query embedding is bounded/cancellable; all body delivery uses the same transactional renderer. */
export async function executeToolAsync(
  name: string,
  input: unknown,
  context: ToolContext,
  signal?: AbortSignal,
): Promise<ToolOutcome> {
  const preparedSearch = await prepareToolSearch(name, input, context, signal);
  return executeTool(name, input, { ...context, ...(preparedSearch && { preparedSearch }) });
}

/** Query preparation has no ledger effects; callers may prepare two independent searches. */
export async function prepareToolSearch(
  name: string,
  input: unknown,
  context: ToolContext,
  signal?: AbortSignal,
): Promise<PreparedSearch | undefined> {
  const parsed = searchInput.safeParse(input);
  if (name !== "search" || !context.search || !parsed.success || context.maxChars === 0)
    return undefined;
  signal?.throwIfAborted();
  const { query, per_note, ...options } = parsed.data;
  const preparedSearch = await context.search(
    context.corpus,
    query,
    { ...options, perNote: per_note ?? 1 },
    signal,
  );
  signal?.throwIfAborted();
  return preparedSearch;
}

class Delivery {
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
    total: number,
    hasMore: boolean,
    truncated: boolean,
    cursor?: string,
    candidateSemantics: "exact" | "lower-bound" = "exact",
  ): ToolOutcome {
    const metadataClipped = this.spans.some((s) => s.scope === "metadata" && s.text.endsWith("…"));
    const contract: ResultContract = {
      version: 1,
      tool: this.tool,
      scope: "accessible-research-corpus",
      effective: this.effective,
      revision: this.context.corpus.revision,
      returned: { count, unit: this.unit },
      candidates: { count: total, semantics: candidateSemantics },
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

function resolveTarget(corpus: Corpus, target: string, source?: string): string {
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
function emptySection(note: ParsedNote): Section {
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
function metadataText(note: ParsedNote): string {
  return Object.keys(note.properties).length
    ? `Metadata: ${truncate(JSON.stringify(note.properties), 2000)}`
    : "";
}
function noteBlock(corpus: Corpus, note: ParsedNote, header: string, parts: string[]): string {
  const attrs = [
    `path="${attribute(note.path)}"`,
    `link="${attribute(`[[${corpus.ambiguous(note.title) || corpus.resolve(note.title) !== note.path ? note.path.replace(/\.md$/i, "") : note.title}]]`)}"`,
    `stage="${attribute(corpus.stage(note.path) ?? "none")}"`,
    ...(note.tags.length ? [`tags="${attribute(note.tags.join(", "))}"`] : []),
    ...(note.aliases.length ? [`aliases="${attribute(note.aliases.join(", "))}"`] : []),
  ];
  return `${header ? `${quoteData(header)}\n` : ""}<note ${attrs.join(" ")}>\n${metadataText(note) ? `${quoteData(metadataText(note))}\n\n` : ""}${parts.map(quoteData).join("\n\n")}\n</note>`;
}
function sectionLabel(section: Section): string {
  return section.headingPath.length ? `§ ${section.headingPath.join(" › ")}` : "§ (top)";
}
function queryKey(tool: string, effective: Record<string, unknown>): string {
  const query = Object.fromEntries(
    Object.entries(effective).filter(([key]) => !["cursor", "limit", "max_chars"].includes(key)),
  );
  // Schema parsing fixes key order. Page size may change on continuation.
  return JSON.stringify([tool, query]);
}
function splitHeading(target: string): [string, string | undefined] {
  const cleaned = target.replace(/^!?\[\[|\]\]$/g, "").replace(/\|.*$/, "");
  const hashIndex = cleaned.indexOf("#");
  return hashIndex === -1
    ? [cleaned, undefined]
    : [cleaned.slice(0, hashIndex), cleaned.slice(hashIndex + 1).trim() || undefined];
}
function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/** Fixed-width regexes have no nested/unbounded backtracking, even on hostile long lines. */
export function boundedMatcher(pattern: string, regex: boolean, caseSensitive: boolean): RegExp {
  if (pattern.length > MAX_REGEX_LENGTH)
    throw new ToolFault("invalid-regex", "Pattern too long. Use at most 200 characters.");
  if (regex) {
    let inClass = false;
    for (let i = 0; i < pattern.length; i++) {
      const char = pattern[i]!;
      if (char === "\\") {
        const escaped = pattern[++i];
        if (!escaped || !/[dDsSwWtnr\\.[\]{}()*+?^$|/-]/.test(escaped))
          throw new ToolFault(
            "invalid-regex",
            "Unsupported regex escape. Use fixed-width character classes or literal mode.",
          );
      } else if (char === "[") inClass = true;
      else if (char === "]") inClass = false;
      else if (!inClass && /[()*+?{}|]/.test(char))
        throw new ToolFault(
          "invalid-regex",
          "Regex groups, alternation and quantifiers are unsupported. Use literal mode or a fixed-width pattern.",
        );
    }
  }
  try {
    return new RegExp(
      regex ? pattern : pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      caseSensitive ? "u" : "iu",
    );
  } catch {
    throw new ToolFault("invalid-regex", "Invalid regex. Fix syntax or use literal mode.");
  }
}

/** Window near matched terms; the exact displayed excerpt is separately recorded. */
export function excerptWindow(
  text: string,
  terms: string[],
  size: number,
): { text: string; start: number; end: number } {
  if (text.length <= size) return { text, start: 0, end: text.length };
  const lower = text.toLowerCase();
  const position = terms
    .map((term) => lower.indexOf(term))
    .filter((index) => index >= 0)
    .reduce((min, index) => Math.min(min, index), Number.POSITIVE_INFINITY);
  const center = Number.isFinite(position) ? position : 0;
  let start = Math.max(0, center - Math.floor(size / 3));
  const lineStart = text.lastIndexOf("\n", start);
  if (lineStart !== -1 && start - lineStart < 80) start = lineStart + 1;
  let end = Math.min(text.length, start + size);
  const raw = text.slice(start, end);
  start += raw.length - raw.trimStart().length;
  end = Math.max(start, end - (raw.length - raw.trimEnd().length));
  return {
    text: `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`,
    start,
    end,
  };
}
export function excerptAround(text: string, terms: string[], size: number): string {
  return excerptWindow(text, terms, size).text;
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
