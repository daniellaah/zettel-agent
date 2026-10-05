import type { ParsedNote } from "./markdown";
import { QUERY_STOPWORDS, stripQueryBoilerplate, tokenize, type TokenizerMode } from "./tokenize";

/**
 * Two-level BM25F over parsed notes.
 *
 * Note-level fields (title, aliases, tags) are scored once per note, so their IDF is
 * computed over notes and a long note does not repeat its title in every chunk.
 * Chunk-level fields (headings, body, link targets) are scored per heading section.
 * A chunk's score is its own score plus its note's score; results are collapsed so one
 * note cannot fill every slot.
 */

const NOTE_FIELDS = ["title", "aliases", "tags"] as const;
const CHUNK_FIELDS = ["headings", "body", "links"] as const;
type NoteField = (typeof NOTE_FIELDS)[number];
type ChunkField = (typeof CHUNK_FIELDS)[number];

export const FIELD_WEIGHTS: Record<NoteField | ChunkField, number> = {
  title: 10,
  aliases: 8,
  headings: 6,
  tags: 5,
  body: 1,
  links: 0.25,
};

/** Switches for retrieval ablations; all are on by default. */
export interface LexicalOptions {
  /** Index hyphenated and punctuated compounds whole as well as by their parts. */
  compounds?: boolean;
  /** Drop vault-referring words such as "note" and "mentions" from queries. */
  queryStopwords?: boolean;
  /** Cut Chinese frames such as "哪篇笔记提到了" from queries before tokenizing. */
  queryBoilerplate?: boolean;
  /**
   * Rate title, alias and tag matches by how many notes use the term anywhere, as BM25F
   * does, rather than only in those fields: a common word in one title is not rare.
   */
  wholeNoteIdf?: boolean;
  /**
   * Score a top heading that repeats the note title once, in the title field, instead of
   * again among section headings.
   */
  titleOnce?: boolean;
}

export interface SearchOptions {
  /** Maximum number of hits (default 10). */
  limit?: number;
  /** Maximum chunks returned per note (default 1). */
  perNote?: number;
  /** Only notes whose path passes are considered. */
  filter?: (path: string) => boolean;
}

export interface SearchHit {
  path: string;
  sectionId: string;
  score: number;
  /** Query terms found in this note, in query order: the "why it matched". */
  matchedTerms: string[];
}

interface Level<F extends string> {
  fields: readonly F[];
  /** term -> doc id -> term frequency per field (same order as `fields`). */
  postings: Map<string, Map<number, number[]>>;
  lengths: Map<number, number[]>;
  lengthSums: number[];
  /** doc id -> distinct terms, so removal touches only that doc's postings. */
  docTerms: Map<number, string[]>;
}

export class LexicalIndex {
  private nextDocId = 0;
  private readonly notes = new Map<string, { noteDoc: number; chunkDocs: number[] }>();
  private readonly noteDocPath = new Map<number, string>();
  private readonly chunkDocInfo = new Map<number, { path: string; sectionId: string }>();
  private readonly noteLevel = createLevel(NOTE_FIELDS);
  private readonly chunkLevel = createLevel(CHUNK_FIELDS);
  /** term -> notes that contain it in any field; note path -> its distinct terms. */
  private readonly noteFrequency = new Map<string, number>();
  private readonly noteTerms = new Map<string, string[]>();

  private readonly k1 = 1.2;
  private readonly b = 0.75;

  constructor(
    readonly mode: TokenizerMode = "both",
    private readonly options: LexicalOptions = {},
  ) {}

  get noteCount(): number {
    return this.notes.size;
  }

  upsert(note: ParsedNote): void {
    this.remove(note.path);
    const noteDoc = this.nextDocId++;
    this.noteDocPath.set(noteDoc, note.path);
    addDoc(this.noteLevel, noteDoc, [
      this.tokens(note.title),
      this.tokens(note.aliases.join("\n")),
      this.tokens(note.tags.map((tag) => tag.replace(/[/_-]/g, " ")).join("\n")),
    ]);

    const chunkDocs = note.sections.map((section) => {
      const doc = this.nextDocId++;
      this.chunkDocInfo.set(doc, { path: note.path, sectionId: section.id });
      const headings =
        this.options.titleOnce !== false &&
        section.headingPath[0]?.trim().toLowerCase() === note.title.trim().toLowerCase()
          ? section.headingPath.slice(1)
          : section.headingPath;
      addDoc(this.chunkLevel, doc, [
        this.tokens(headings.join("\n")),
        this.tokens(section.text),
        this.tokens(section.links.join("\n")),
      ]);
      return doc;
    });
    this.notes.set(note.path, { noteDoc, chunkDocs });
    const terms = new Set(this.noteLevel.docTerms.get(noteDoc));
    for (const doc of chunkDocs)
      for (const term of this.chunkLevel.docTerms.get(doc)!) terms.add(term);
    for (const term of terms) this.noteFrequency.set(term, (this.noteFrequency.get(term) ?? 0) + 1);
    this.noteTerms.set(note.path, [...terms]);
  }

  remove(path: string): void {
    const entry = this.notes.get(path);
    if (!entry) return;
    removeDoc(this.noteLevel, entry.noteDoc);
    this.noteDocPath.delete(entry.noteDoc);
    for (const doc of entry.chunkDocs) {
      removeDoc(this.chunkLevel, doc);
      this.chunkDocInfo.delete(doc);
    }
    this.notes.delete(path);
    for (const term of this.noteTerms.get(path) ?? []) {
      const count = this.noteFrequency.get(term)! - 1;
      if (count) this.noteFrequency.set(term, count);
      else this.noteFrequency.delete(term);
    }
    this.noteTerms.delete(path);
  }

  search(query: string, options: SearchOptions = {}): SearchHit[] {
    const { limit = 10, perNote = 1, filter } = options;
    const terms = this.queryTerms(query);
    if (terms.length === 0) return [];

    const noteScores = this.score(this.noteLevel, terms, this.notes.size, this.noteDf);
    const chunkScores = this.score(this.chunkLevel, terms, this.chunkDocInfo.size);

    const byNote = new Map<string, { noteScore: number; chunks: [number, number][] }>();
    const entryFor = (path: string) => {
      let entry = byNote.get(path);
      if (!entry) byNote.set(path, (entry = { noteScore: 0, chunks: [] }));
      return entry;
    };
    for (const [doc, { score }] of noteScores) {
      const path = this.noteDocPath.get(doc)!;
      if (!filter || filter(path)) entryFor(path).noteScore = score;
    }
    for (const [doc, { score }] of chunkScores) {
      const { path } = this.chunkDocInfo.get(doc)!;
      if (!filter || filter(path)) entryFor(path).chunks.push([doc, score]);
    }

    const hits: (SearchHit & { order: number })[] = [];
    for (const [path, { noteScore, chunks }] of byNote) {
      if (chunks.length === 0) {
        // Matched on title/alias/tag only: cite the note's first section.
        const first = this.notes.get(path)!.chunkDocs[0];
        if (first !== undefined) chunks.push([first, 0]);
      }
      chunks.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
      const matchedTerms = terms.filter(
        (term) =>
          noteScores.get(this.notes.get(path)!.noteDoc)?.terms.has(term) ||
          chunks.some(([doc]) => chunkScores.get(doc)?.terms.has(term)),
      );
      for (const [doc, chunkScore] of chunks.slice(0, perNote)) {
        hits.push({
          path,
          sectionId: this.chunkDocInfo.get(doc)!.sectionId,
          score: noteScore + chunkScore,
          matchedTerms,
          order: doc,
        });
      }
    }

    // Deterministic order: score, then path, then position in the note.
    return hits
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.order - b.order)
      .slice(0, limit)
      .map(({ path, sectionId, score, matchedTerms }) => ({
        path,
        sectionId,
        score,
        matchedTerms,
      }));
  }

  /** Distinct query terms, without vault-referring words unless nothing else is left. */
  queryTerms(query: string): string[] {
    const terms = [...new Set(this.tokens(query))];
    const { queryStopwords, queryBoilerplate } = this.options;
    if (queryStopwords === false && queryBoilerplate === false) return terms;
    const text = queryBoilerplate === false ? query : stripQueryBoilerplate(query);
    const content = [...new Set(this.tokens(text))].filter(
      (term) => queryStopwords === false || !QUERY_STOPWORDS.has(term),
    );
    return content.length ? content : terms;
  }

  /** Note-level document frequency: whole notes by default, the note fields alone if not. */
  private readonly noteDf = (term: string): number =>
    this.options.wholeNoteIdf === false
      ? (this.noteLevel.postings.get(term)?.size ?? 0)
      : (this.noteFrequency.get(term) ?? 0);

  /**
   * The score a section would reach if every query term saturated both levels. Terms the
   * index has never seen count as maximally rare, so dividing by this keeps the scores of a
   * query the index can barely match low.
   */
  maxScore(query: string): number {
    let max = 0;
    for (const term of this.queryTerms(query)) {
      if (this.notes.size) max += (this.k1 + 1) * idf(this.notes.size, this.noteDf(term));
      if (this.chunkDocInfo.size)
        max +=
          (this.k1 + 1) *
          idf(this.chunkDocInfo.size, this.chunkLevel.postings.get(term)?.size ?? 0);
    }
    return max;
  }

  private tokens(text: string): string[] {
    return tokenize(text, this.mode, { compounds: this.options.compounds !== false });
  }

  private score<F extends string>(
    level: Level<F>,
    terms: string[],
    docCount: number,
    documentFrequency: (term: string) => number = (term) => level.postings.get(term)?.size ?? 0,
  ): Map<number, { score: number; terms: Set<string> }> {
    const scores = new Map<number, { score: number; terms: Set<string> }>();
    if (docCount === 0) return scores;
    const averages = level.lengthSums.map((sum) => sum / docCount || 1);
    const weights = level.fields.map((field) => FIELD_WEIGHTS[field as NoteField | ChunkField]);

    for (const term of terms) {
      const postings = level.postings.get(term);
      if (!postings) continue;
      const termIdf = idf(docCount, documentFrequency(term));
      for (const [doc, frequencies] of postings) {
        const lengths = level.lengths.get(doc)!;
        let weightedTf = 0;
        frequencies.forEach((tf, i) => {
          if (tf === 0) return;
          const norm = 1 - this.b + this.b * (lengths[i]! / averages[i]!);
          weightedTf += (weights[i]! * tf) / norm;
        });
        const entry = scores.get(doc) ?? { score: 0, terms: new Set<string>() };
        entry.score += (termIdf * weightedTf * (this.k1 + 1)) / (this.k1 + weightedTf);
        entry.terms.add(term);
        scores.set(doc, entry);
      }
    }
    return scores;
  }
}

function idf(docCount: number, documentFrequency: number): number {
  return Math.log(1 + (docCount - documentFrequency + 0.5) / (documentFrequency + 0.5));
}

function createLevel<F extends string>(fields: readonly F[]): Level<F> {
  return {
    fields,
    postings: new Map(),
    lengths: new Map(),
    lengthSums: fields.map(() => 0),
    docTerms: new Map(),
  };
}

function addDoc<F extends string>(level: Level<F>, doc: number, fieldTokens: string[][]): void {
  const lengths = fieldTokens.map((tokens) => tokens.length);
  level.lengths.set(doc, lengths);
  lengths.forEach((length, i) => (level.lengthSums[i]! += length));
  fieldTokens.forEach((tokens, fieldIndex) => {
    for (const token of tokens) {
      let postings = level.postings.get(token);
      if (!postings) level.postings.set(token, (postings = new Map<number, number[]>()));
      let frequencies = postings.get(doc);
      if (!frequencies) postings.set(doc, (frequencies = level.fields.map(() => 0)));
      frequencies[fieldIndex]!++;
    }
  });
  level.docTerms.set(doc, [...new Set(fieldTokens.flat())]);
}

function removeDoc<F extends string>(level: Level<F>, doc: number): void {
  const lengths = level.lengths.get(doc);
  if (!lengths) return;
  lengths.forEach((length, i) => (level.lengthSums[i]! -= length));
  level.lengths.delete(doc);
  for (const term of level.docTerms.get(doc) ?? []) {
    const postings = level.postings.get(term);
    if (postings?.delete(doc) && postings.size === 0) level.postings.delete(term);
  }
  level.docTerms.delete(doc);
}
