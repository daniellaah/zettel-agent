import { z } from "zod";

import { FUSION_CANDIDATES, type CorpusHit } from "../../retrieval/corpus";
import { defineTool, Delivery, filters, noteBlock, sectionLabel } from "./shared";

const EXCERPT_CHARS = 600;

const searchInput = z
  .object({
    query: z.string().min(1).max(2000).describe("Keywords in Chinese or English."),
    ...filters,
    limit: z.number().int().min(1).max(20).optional().describe("Total section limit (default 8)."),
    per_note: z.number().int().min(1).max(5).optional().describe("Sections per note (default 1)."),
  })
  .strict();

export const searchTool = defineTool({
  name: "search",
  schema: searchInput,
  description:
    "Ranked section excerpts by shared keywords (BM25F) and, once the local semantic index is ready, closeness of meaning in any language (hybrid). Each hit says what found it. Scores are ranking, not entailment. Default one section per note; per_note can expand coverage. Read excerpts before relying on omitted details.",
  run: (input, context) => {
    const { corpus } = context;
    // Hybrid only when this corpus keeps vectors; otherwise keywords alone.
    const queryVector = corpus.dense ? context.semantic?.vectors.get(input.query) : undefined;
    // The effective mode tells the model which ranking produced these results.
    const mode = queryVector ? "hybrid" : "lexical";
    const effective = {
      ...input,
      limit: input.limit ?? 8,
      per_note: input.per_note ?? 1,
      mode,
    };
    const hits = corpus.search(input.query, {
      ...input,
      perNote: effective.per_note,
      limit: Number.MAX_SAFE_INTEGER,
      ...(queryVector && { mode: "hybrid", queryVector, fusion: context.semantic!.fusion }),
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
      return noteBlock(corpus, note, `[${id}] ${hitLabel(hit, mode)}`, [
        `${sectionLabel(section)}\n${excerpt}`,
      ]);
    });
    return delivery.finish(
      blocks.join("\n\n") ||
        (mode === "lexical"
          ? `No notes match these keywords in the specified research scope. Try synonyms or fewer filters.`
          : `No notes match in the specified research scope. Try fewer filters.`),
      `search "${input.query}" → ${page.length} section${page.length === 1 ? "" : "s"}`,
      page.length,
      // Hybrid search ranks every section by meaning, so its candidate set is not exact.
      mode === "lexical" ? hits.length : null,
      hits.length > page.length,
      clipped,
    );
  },
});

/** What found a hit, so a meaning-only match is not mistaken for shared wording. */
function hitLabel(hit: CorpusHit, mode: "lexical" | "hybrid"): string {
  const score = hit.score.toFixed(3);
  if (mode === "lexical")
    return `matched: ${hit.matchedTerms.join(", ")} (terms found in note; lexical ranking score=${score})`;
  const byKeywords = hit.lexicalRank !== null && hit.lexicalRank <= FUSION_CANDIDATES;
  const byMeaning = hit.semanticRank !== null && hit.semanticRank <= FUSION_CANDIDATES;
  const foundBy =
    byKeywords && byMeaning ? "keywords and meaning" : byMeaning ? "meaning only" : "keywords only";
  return `matched: ${hit.matchedTerms.join(", ") || "no shared terms"} (found by ${foundBy}; hybrid ranking score=${score})`;
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
