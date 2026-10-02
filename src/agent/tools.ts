import { z } from "zod";

import type { Corpus } from "../retrieval/corpus";
import { sectionSubtree, type ParsedNote, type Section } from "../retrieval/markdown";
import type { EvidenceLedger } from "./evidence";
import type { ToolDefinition } from "./provider";

/**
 * The agent's tools. All of them are read-only: they search and read the corpus and
 * never touch the vault. Note text is wrapped in <note> tags and treated as data.
 */

export interface ToolContext {
  corpus: Corpus;
  ledger: EvidenceLedger;
}

export interface ToolOutcome {
  /** Text returned to the model as the tool_result. */
  content: string;
  isError: boolean;
  /** One line for the UI, e.g. `search "双塔" → 5 notes`. */
  summary: string;
  /** Evidence ids delivered by this call. */
  evidenceIds: string[];
  /** How many of those ids the model had not seen before. */
  newEvidence: number;
}

const EXCERPT_CHARS = 600;
const PREVIEW_CHARS = 200;
const READ_CHARS = 12_000;
const MAX_REGEX_LENGTH = 200;

const stagesSchema = z
  .array(z.enum(["literature", "permanent", "writing"]))
  .optional()
  .describe("Only notes in these research stages; fleeting captures are excluded.");
const folderSchema = z.string().optional().describe("Only notes under this vault folder.");
const tagSchema = z.string().optional().describe("Only notes with this tag or a sub-tag of it.");

const searchInput = z
  .object({
    query: z
      .string()
      .min(1)
      .describe("Keywords. Chinese and English both work; try the other language on a miss."),
    stages: stagesSchema,
    folder: folderSchema,
    tag: tagSchema,
    limit: z.number().int().min(1).max(20).optional().describe("Maximum notes (default 8)."),
  })
  .strict();

const matchInput = z
  .object({
    pattern: z.string().min(1).max(MAX_REGEX_LENGTH).describe("Text to find."),
    regex: z.boolean().optional().describe("Treat the pattern as a JavaScript regex."),
    case_sensitive: z.boolean().optional(),
    stages: stagesSchema,
    limit: z.number().int().min(1).max(50).optional().describe("Maximum lines (default 20)."),
  })
  .strict();

const readInput = z
  .object({
    target: z
      .string()
      .min(1)
      .describe(
        'An evidence id ("E3") to expand that section with its sub-sections, or a note path/title, optionally with "#Heading" to read one section. A bare note reads the whole note.',
      ),
  })
  .strict();

const linksInput = z
  .object({
    target: z.string().min(1).describe("Note path or title."),
    depth: z
      .union([z.literal(1), z.literal(2)])
      .optional()
      .describe("2 also lists notes two links away (default 1)."),
  })
  .strict();

const listInput = z
  .object({
    stages: stagesSchema,
    folder: folderSchema,
    tag: tagSchema,
    orphans_only: z.boolean().optional().describe("Only notes with no links in or out."),
    preview: z
      .boolean()
      .optional()
      .describe("Add each note's opening lines, to skim many notes without reading each one."),
    limit: z.number().int().min(1).max(200).optional().describe("Maximum notes (default 50)."),
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
    description:
      "Ranked keyword search (BM25) over the Zettelkasten. Returns the best-matching section of each note as an excerpt with an evidence id. Start here for most questions.",
    schema: searchInput,
    run: (input, { corpus, ledger }) => {
      const hits = corpus.search(input.query, {
        limit: input.limit ?? 8,
        ...(input.stages && { stages: input.stages }),
        ...(input.folder && { folder: input.folder }),
        ...(input.tag && { tag: input.tag }),
      });
      if (hits.length === 0) {
        return outcome(
          `No notes match "${input.query}". Try synonyms, aliases, fewer filters, or \`list\` to browse.`,
          `search "${input.query}" → no matches`,
        );
      }
      const delivered = new Delivery(ledger);
      const blocks = hits.map((hit) => {
        const note = corpus.get(hit.path)!;
        const section = note.sections.find((s) => s.id === hit.sectionId)!;
        const id = delivered.add(note, section);
        const excerpt = excerptAround(section.text, hit.matchedTerms, EXCERPT_CHARS);
        return noteBlock(corpus, note, `[${id}] matched: ${hit.matchedTerms.join(", ")}`, [
          `${sectionLabel(section)}\n${excerpt}`,
        ]);
      });
      return delivered.outcome(
        blocks.join("\n\n"),
        `search "${input.query}" → ${hits.length} note${hits.length === 1 ? "" : "s"}`,
      );
    },
  }),

  defineTool({
    name: "match",
    description:
      "Exact text or regex search, line by line, for questions like 'which notes mention X'. Returns matching lines with evidence ids. Use `search` for concepts.",
    schema: matchInput,
    run: (input, { corpus, ledger }) => {
      let matcher: RegExp;
      try {
        const source = input.regex ? input.pattern : escapeRegex(input.pattern);
        matcher = new RegExp(source, input.case_sensitive ? "u" : "iu");
      } catch (error) {
        return failure(`Invalid regex: ${(error as Error).message}`, "match → invalid regex");
      }
      const limit = input.limit ?? 20;
      const delivered = new Delivery(ledger);
      const lines: string[] = [];
      let total = 0;
      for (const path of corpus.paths()) {
        const stage = corpus.stage(path);
        if (input.stages && (!stage || stage === "fleeting" || !input.stages.includes(stage)))
          continue;
        const note = corpus.get(path)!;
        for (const section of note.sections) {
          section.text.split("\n").forEach((line, offset) => {
            if (!matcher.test(line)) return;
            total++;
            if (lines.length >= limit) return;
            const id = delivered.add(note, section);
            lines.push(
              `[${id}] ${path}:${section.startLine + offset + 1} (${sectionLabel(section)})\n  ${quote(truncate(line.trim(), 300))}`,
            );
          });
        }
      }
      if (total === 0) {
        return outcome(`No line matches ${JSON.stringify(input.pattern)}.`, "match → no lines");
      }
      const more = total > lines.length ? `\n\n(${total - lines.length} more lines not shown)` : "";
      return delivered.outcome(
        `<note_lines>\n${lines.join("\n")}\n</note_lines>${more}`,
        `match ${JSON.stringify(input.pattern)} → ${total} line${total === 1 ? "" : "s"}`,
      );
    },
  }),

  defineTool({
    name: "read",
    description:
      "Read note text in full: expand an evidence id to its whole section (with sub-sections), read one section by heading, or read a whole note. Use before quoting or relying on details.",
    schema: readInput,
    run: (input, { corpus, ledger }) => {
      const target = input.target.trim();
      const evidence = /^E\d+$/i.test(target) ? ledger.get(target) : undefined;
      if (/^E\d+$/i.test(target) && !evidence) {
        return failure(`Unknown evidence id ${target}.`, `read ${target} → unknown id`);
      }
      const [pathPart, heading] = evidence ? [evidence.path, undefined] : splitHeading(target);
      const path = corpus.resolve(pathPart);
      const note = path ? corpus.get(path) : undefined;
      if (!note) {
        return failure(
          `No note named "${pathPart}". Use \`search\` or \`list\` to find the exact title.`,
          `read "${pathPart}" → not found`,
        );
      }

      let sections: Section[];
      if (evidence) {
        sections = sectionSubtree(note, evidence.sectionId);
        if (sections.length === 0) sections = note.sections; // the section was edited away
      } else if (heading) {
        const wanted = heading.toLowerCase();
        const start = note.sections.find((s) => s.headingPath.at(-1)?.toLowerCase() === wanted);
        if (!start) {
          const headings = note.sections.map((s) => s.headingPath.at(-1)).filter(Boolean);
          return failure(
            `"${note.title}" has no heading "${heading}". Headings: ${headings.join(" | ")}`,
            `read "${target}" → heading not found`,
          );
        }
        sections = sectionSubtree(note, start.id);
      } else {
        sections = note.sections;
      }

      const delivered = new Delivery(ledger);
      const parts: string[] = [];
      let size = 0;
      let truncated = false;
      for (const section of sections) {
        if (size + section.text.length > READ_CHARS && parts.length > 0) {
          truncated = true;
          break;
        }
        const id = delivered.add(note, section);
        parts.push(`[${id}]\n${truncate(section.text, READ_CHARS)}`);
        size += section.text.length;
      }
      const changed =
        evidence && evidence.contentHash !== note.contentHash
          ? `Note changed since ${evidence.id} was read; this is the current text.`
          : "";
      const tail = truncated
        ? "\n\n(Truncated. Read a specific section with its heading to see the rest.)"
        : "";
      return delivered.outcome(
        noteBlock(corpus, note, changed, parts) + tail,
        `read ${note.title}${heading ? `#${heading}` : ""}`,
      );
    },
  }),

  defineTool({
    name: "links",
    description:
      "A note's link neighbourhood: outgoing links, backlinks and unresolved links; depth 2 adds notes two hops away. Each note has an evidence id. Use to follow ideas across notes, check how a note is connected, or find orphans' context.",
    schema: linksInput,
    run: (input, { corpus, ledger }) => {
      const path = corpus.resolve(input.target);
      if (!path) {
        return failure(`No note named "${input.target}".`, `links "${input.target}" → not found`);
      }
      const graph = corpus.graph();
      const delivered = new Delivery(ledger);
      const label = (p: string) =>
        `${delivered.noteLabel(corpus.get(p)!)}${corpus.get(p)!.title} (${corpus.stage(p) ?? "—"}) ${p}`;
      const describe = (p: string) => `- ${label(p)}`;
      const outlinks = graph.outlinks(path);
      const backlinks = graph.backlinks(path);
      const unresolved = graph.unresolvedLinks(path);
      const lines = [
        `Note: ${label(path)}`,
        `Outgoing (${outlinks.length}):`,
        ...outlinks.map(describe),
        `Backlinks (${backlinks.length}):`,
        ...backlinks.map(describe),
      ];
      if (unresolved.length > 0) {
        lines.push(`Unresolved links (${unresolved.length}): ${unresolved.join(", ")}`);
      }
      if (input.depth === 2) {
        const twoHops = [...graph.neighborhood(path, 2)].filter(([, hop]) => hop === 2);
        lines.push(`Two links away (${twoHops.length}):`, ...twoHops.map(([p]) => describe(p)));
      }
      return delivered.outcome(
        lines.join("\n"),
        `links ${corpus.get(path)!.title} → ${outlinks.length} out, ${backlinks.length} in`,
      );
    },
  }),

  defineTool({
    name: "list",
    description:
      "List notes by stage, folder or tag, with their link counts and an evidence id each. With `preview`, each note also shows its opening lines. Use to survey what exists, skim many notes at once, find orphan notes, or browse when search terms are unclear.",
    schema: listInput,
    run: (input, { corpus, ledger }) => {
      const graph = corpus.graph();
      const wantedTag = input.tag?.replace(/^#/, "").toLowerCase();
      const prefix = input.folder ? `${input.folder.replace(/\/+$/, "")}/` : null;
      const rows = corpus.paths().filter((path) => {
        const stage = corpus.stage(path);
        if (input.stages && (!stage || stage === "fleeting" || !input.stages.includes(stage)))
          return false;
        if (prefix && !path.startsWith(prefix)) return false;
        if (input.orphans_only && !graph.isOrphan(path)) return false;
        if (wantedTag) {
          const tags = corpus.get(path)!.tags.map((t) => t.toLowerCase());
          if (!tags.some((t) => t === wantedTag || t.startsWith(`${wantedTag}/`))) return false;
        }
        return true;
      });
      if (rows.length === 0) {
        return outcome("No notes match these filters.", "list → 0 notes");
      }
      const limit = input.limit ?? 50;
      const delivered = new Delivery(ledger);
      const lines = rows.slice(0, limit).map((path) => {
        const note = corpus.get(path)!;
        const tags = note.tags.length > 0 ? ` #${note.tags.join(" #")}` : "";
        const row = `- ${delivered.noteLabel(note)}${note.title} (${corpus.stage(path) ?? "—"}, ${graph.outlinks(path).length} out, ${graph.backlinks(path).length} in)${tags} ${path}`;
        const opening = input.preview ? openingText(note, PREVIEW_CHARS) : "";
        return opening ? `${row}\n  ${quote(opening)}` : row;
      });
      const more = rows.length > limit ? `\n(${rows.length - limit} more not shown)` : "";
      const body = `${lines.join("\n")}${more}`;
      return delivered.outcome(
        input.preview ? `<note_lines>\n${body}\n</note_lines>` : body,
        `list → ${rows.length} note${rows.length === 1 ? "" : "s"}`,
      );
    },
  }),
];

/** Tool definitions for the Messages API, in a fixed order so the prompt cache stays warm. */
export function toolDefinitions(): ToolDefinition[] {
  return TOOLS.map((tool) => {
    const schema = z.toJSONSchema(tool.schema) as Record<string, unknown>;
    delete schema.$schema;
    return { name: tool.name, description: tool.description, inputSchema: schema };
  });
}

/** Validates the model's input and runs the tool. Never throws. */
export function executeTool(name: string, input: unknown, context: ToolContext): ToolOutcome {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return failure(`Unknown tool "${name}".`, `${name} → unknown tool`);
  const parsed = tool.schema.safeParse(input);
  if (!parsed.success) {
    return failure(`Invalid input: ${z.prettifyError(parsed.error)}`, `${name} → invalid input`);
  }
  try {
    return tool.run(parsed.data, context);
  } catch (error) {
    return failure(`Tool failed: ${(error as Error).message}`, `${name} → failed`);
  }
}

class Delivery {
  private readonly ids: string[] = [];
  private fresh = 0;

  constructor(private readonly ledger: EvidenceLedger) {}

  add(note: ParsedNote, section: Section): string {
    const { evidence, isNew } = this.ledger.register({
      path: note.path,
      sectionId: section.id,
      headingPath: section.headingPath,
      contentHash: note.contentHash,
    });
    if (!this.ids.includes(evidence.id)) {
      this.ids.push(evidence.id);
      if (isNew) this.fresh++;
    }
    return evidence.id;
  }

  /** "[E3] " for a note cited as a whole (its first section), or "" for an empty note. */
  noteLabel(note: ParsedNote): string {
    const first = note.sections[0];
    return first ? `[${this.add(note, first)}] ` : "";
  }

  outcome(content: string, summary: string): ToolOutcome {
    return { content, isError: false, summary, evidenceIds: this.ids, newEvidence: this.fresh };
  }
}

function outcome(content: string, summary: string): ToolOutcome {
  return { content, isError: false, summary, evidenceIds: [], newEvidence: 0 };
}

function failure(content: string, summary: string): ToolOutcome {
  return { content, isError: true, summary, evidenceIds: [], newEvidence: 0 };
}

function noteBlock(corpus: Corpus, note: ParsedNote, header: string, parts: string[]): string {
  const attributes = [
    `path="${note.path}"`,
    `link="[[${note.title}]]"`,
    `stage="${corpus.stage(note.path) ?? "none"}"`,
    note.tags.length > 0 ? `tags="${note.tags.join(", ")}"` : "",
    note.aliases.length > 0 ? `aliases="${note.aliases.join(", ")}"` : "",
  ].filter(Boolean);
  const heading = header ? `${header}\n` : "";
  const metadata = Object.keys(note.properties).length
    ? `Metadata: ${truncate(JSON.stringify(note.properties), 2000)}\n\n`
    : "";
  return `${heading}<note ${attributes.join(" ")}>\n${quote(metadata)}${parts.map(quote).join("\n\n")}\n</note>`;
}

function sectionLabel(section: Section): string {
  return section.headingPath.length > 0 ? `§ ${section.headingPath.join(" › ")}` : "§ (top)";
}

/** Window of text around the first matched term, preferring whole lines. */
export function excerptAround(text: string, terms: string[], size: number): string {
  if (text.length <= size) return text;
  const lower = text.toLowerCase();
  const position = terms
    .map((term) => lower.indexOf(term))
    .filter((index) => index >= 0)
    .reduce((min, index) => Math.min(min, index), Number.POSITIVE_INFINITY);
  const center = Number.isFinite(position) ? position : 0;
  let start = Math.max(0, center - Math.floor(size / 3));
  const lineStart = text.lastIndexOf("\n", start);
  if (lineStart !== -1 && start - lineStart < 80) start = lineStart + 1;
  const end = Math.min(text.length, start + size);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

/** A note's first words of body text, headings dropped and whitespace collapsed. */
export function openingText(note: ParsedNote, size: number): string {
  const text = note.sections
    .flatMap((section) => section.text.split("\n"))
    .filter((line) => !/^#{1,6}\s/.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return truncate(text, size);
}

function splitHeading(target: string): [string, string | undefined] {
  const cleaned = target.replace(/^!?\[\[|\]\]$/g, "").replace(/\|.*$/, "");
  const hash = cleaned.indexOf("#");
  if (hash === -1) return [cleaned, undefined];
  return [cleaned.slice(0, hash), cleaned.slice(hash + 1).trim() || undefined];
}

/** Keeps note text from closing our wrapper tags. */
function quote(text: string): string {
  return text.replace(/<\/(note|note_lines)>/gi, "<\\/$1>");
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
