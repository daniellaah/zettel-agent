import { STAGES, type Stage } from "../settings";
import { DenseIndex } from "./dense-index";
import { reciprocalRankFusion, sectionKey } from "./fusion";
import { LinkGraph, basenameResolver, type LinkResolver } from "./graph";
import { LexicalIndex, type SearchHit } from "./lexical-index";
import { hash, parseNote, type ParsedNote } from "./markdown";
import { normalizeText, textLanguage } from "./tokenize";

export interface CorpusOptions {
  /** Stage from the note's folder; a frontmatter `type` naming a stage overrides it. */
  stageForPath: (path: string) => Stage | null;
  /** Link resolution; defaults to basename matching over the corpus's own notes. */
  resolver?: LinkResolver;
  /** Keep section vectors for hybrid search. */
  semantic?: boolean;
}

/** Sections each retriever contributes before fusion. */
export const FUSION_CANDIDATES = 50;

/**
 * How hybrid search merges its two lists. rrf: reciprocal rank fusion of ranks only.
 * convex: alpha × BM25 normalized by the query's highest possible score + (1 − alpha) ×
 * cosine similarity.
 */
export type Fusion = { method: "rrf"; k: number } | { method: "convex"; alpha: number };

export interface CorpusSearchOptions {
  limit?: number | undefined;
  perNote?: number | undefined;
  stages?: Stage[] | undefined;
  /** Vault-relative folder prefix. */
  folder?: string | undefined;
  tag?: string | undefined;
  /**
   * Also rank by closeness of meaning (needs a `semantic` corpus): the query embedded with
   * the same embedder as the sections, and how to merge that list with the keyword list.
   * Without it, search uses keywords (BM25F) alone.
   */
  hybrid?: { queryVector: Float32Array; fusion: Fusion } | undefined;
}

export interface CorpusHit extends SearchHit {
  /** 1-based rank in the keyword candidate list, or null where keywords did not retrieve it. */
  lexicalRank: number | null;
  /** 1-based rank in the semantic candidate list, or null. */
  semanticRank: number | null;
}

/** The notes the agent can see, with their search indexes and link graph. */
export class Corpus {
  private readonly notes = new Map<string, ParsedNote>();
  private readonly index: LexicalIndex;
  private denseIndex: DenseIndex | null;
  /** Each note's main language, so the agent can search in the language the notes use. */
  private readonly languages = new Map<string, "zh" | "en">();
  private cachedGraph: LinkGraph | null = null;
  private cachedResolver: LinkResolver | null = null;

  constructor(private readonly options: CorpusOptions) {
    this.index = new LexicalIndex();
    this.denseIndex = options.semantic ? new DenseIndex() : null;
  }

  /** Section vectors; null unless the corpus was created with `semantic`. */
  get dense(): DenseIndex | null {
    return this.denseIndex;
  }

  /** Drops every vector, e.g. when a different embedder takes over; sections stay pending. */
  resetVectors(): void {
    if (!this.denseIndex) return;
    this.denseIndex = new DenseIndex();
    for (const note of this.notes.values()) this.denseIndex.upsert(note);
  }

  get size(): number {
    return this.notes.size;
  }

  /** Content/stage/path identity, stable across identical rebuilds. */
  get revision(): string {
    return hash(
      JSON.stringify(
        this.paths().map((path) => [path, this.notes.get(path)!.contentHash, this.stage(path)]),
      ),
    );
  }

  /** Shared filters: an omitted or empty stage array means all research stages. */
  eligible(path: string, options: CorpusSearchOptions = {}): boolean {
    const note = this.notes.get(path);
    if (!note) return false;
    const { stages, folder, tag } = options;
    if (folder && !path.startsWith(`${folder.replace(/\/+$/, "")}/`)) return false;
    if (stages?.length) {
      const stage = this.stage(path);
      if (!stage || !stages.includes(stage)) return false;
    }
    const wanted = tag?.replace(/^#/, "").toLowerCase();
    return (
      !wanted ||
      note.tags.some((t) => t.toLowerCase() === wanted || t.toLowerCase().startsWith(`${wanted}/`))
    );
  }

  /** Bare duplicate names need explicit source context or an exact path. */
  ambiguous(target: string, sourcePath?: string): boolean {
    const cleaned = linkTarget(target);
    const name = cleaned.replace(/\.md$/i, "");
    if (sourcePath || this.notes.has(cleaned) || this.notes.has(`${cleaned}.md`)) return false;
    return (
      this.paths().filter(
        (path) => path.replace(/\.md$/i, "").split("/").pop()?.toLowerCase() === name.toLowerCase(),
      ).length > 1
    );
  }

  /** How many notes are mainly Chinese and how many mainly English. */
  languageCounts(): { zh: number; en: number } {
    const counts = { zh: 0, en: 0 };
    for (const language of this.languages.values()) counts[language]++;
    return counts;
  }

  paths(): string[] {
    return [...this.notes.keys()].sort();
  }

  get(path: string): ParsedNote | undefined {
    return this.notes.get(path);
  }

  upsert(path: string, content: string): ParsedNote {
    const existing = this.notes.get(path);
    const note = parseNote(path, content);
    const stage = this.stageOf(path, note);
    // Captures remain in the vault but are outside every research tool's corpus.
    if (stage === "fleeting") {
      this.remove(path);
      return note;
    }
    if (existing?.contentHash === note.contentHash) return existing;
    this.notes.set(path, note);
    this.languages.set(path, textLanguage(note.sections.map((section) => section.text).join("\n")));
    this.index.upsert(note);
    this.dense?.upsert(note);
    this.invalidate();
    return note;
  }

  remove(path: string): void {
    if (!this.notes.delete(path)) return;
    this.languages.delete(path);
    this.index.remove(path);
    this.dense?.remove(path);
    this.invalidate();
  }

  private invalidate(): void {
    this.cachedGraph = null;
    // A custom resolver (Obsidian's) tracks vault changes itself; the fallback must be rebuilt.
    if (!this.options.resolver) this.cachedResolver = null;
  }

  stage(path: string): Stage | null {
    return this.stageOf(path, this.notes.get(path));
  }

  /** A frontmatter `type` naming a stage overrides the folder's stage. */
  private stageOf(path: string, note: ParsedNote | undefined): Stage | null {
    const type = note?.type;
    if (type && (STAGES as readonly string[]).includes(type)) return type as Stage;
    return this.options.stageForPath(path);
  }

  graph(): LinkGraph {
    if (!this.cachedGraph) {
      const rawLinks = new Map([...this.notes].map(([path, note]) => [path, note.links]));
      this.cachedGraph = LinkGraph.build(rawLinks, (target, source) =>
        this.resolve(target, source),
      );
    }
    return this.cachedGraph;
  }

  /**
   * Resolves a vault path, a note title or a `[[link]]` to a note in this corpus.
   * Links that resolve to notes outside the corpus count as unresolved.
   */
  resolve(target: string, sourcePath = ""): string | null {
    const cleaned = linkTarget(target);
    if (this.notes.has(cleaned)) return cleaned;
    if (this.notes.has(`${cleaned}.md`)) return `${cleaned}.md`;
    this.cachedResolver ??= this.options.resolver ?? basenameResolver(this.notes.keys());
    const resolved = this.cachedResolver(cleaned, sourcePath);
    return resolved !== null && this.notes.has(resolved) ? resolved : null;
  }

  search(query: string, options: CorpusSearchOptions = {}): CorpusHit[] {
    const filter = (path: string) => this.eligible(path, options);
    let ranked = this.rank(query, options.hybrid, filter);
    const phrases = quotedPhrases(query);
    if (phrases.length) ranked = this.phrasesFirst(ranked, phrases, filter);
    // Keep each note's best sections only, after ranking every section.
    const perNote = options.perNote ?? 1;
    const perPath = new Map<string, number>();
    return ranked
      .filter((hit) => {
        const count = perPath.get(hit.path) ?? 0;
        perPath.set(hit.path, count + 1);
        return count < perNote;
      })
      .slice(0, options.limit ?? 10);
  }

  /** Every candidate section, best first, with its rank in each retriever's list. */
  private rank(
    query: string,
    hybrid: CorpusSearchOptions["hybrid"],
    filter: (path: string) => boolean,
  ): CorpusHit[] {
    const all = { limit: Number.MAX_SAFE_INTEGER, perNote: Number.MAX_SAFE_INTEGER, filter };
    const lexical = this.index.search(query, all);
    if (!hybrid)
      return lexical.map((hit, i) => ({ ...hit, lexicalRank: i + 1, semanticRank: null }));
    const dense = this.dense;
    if (!dense) throw new Error("A hybrid search needs a semantic corpus.");
    const { queryVector, fusion } = hybrid;
    const semantic = dense.search(queryVector, all);

    const lexicalRanks = new Map(lexical.map((hit, i) => [sectionKey(hit), { hit, rank: i + 1 }]));
    const semanticRanks = new Map(
      semantic.map((hit, i) => [sectionKey(hit), { hit, rank: i + 1 }]),
    );
    const matchedTerms = new Map(lexical.map((hit) => [hit.path, hit.matchedTerms]));
    const describe = (path: string, sectionId: string, score: number): CorpusHit => {
      const key = sectionKey({ path, sectionId });
      return {
        path,
        sectionId,
        score,
        matchedTerms: matchedTerms.get(path) ?? [],
        lexicalRank: lexicalRanks.get(key)?.rank ?? null,
        semanticRank: semanticRanks.get(key)?.rank ?? null,
      };
    };

    const top = [lexical, semantic].map((list) => list.slice(0, FUSION_CANDIDATES));
    if (fusion.method === "rrf")
      return reciprocalRankFusion(top, fusion.k).map((fused) =>
        describe(fused.path, fused.sectionId, fused.score),
      );

    // Convex combination: BM25 divided by the query's highest possible score, so keywords
    // weigh in only as far as the query's terms actually matched, plus cosine similarity.
    const max = this.index.maxScore(query) || 1;
    const candidates = new Map(top.flat().map((hit) => [sectionKey(hit), hit]));
    return [...candidates.values()]
      .map(({ path, sectionId }) => {
        const key = sectionKey({ path, sectionId });
        const keyword = (lexicalRanks.get(key)?.hit.score ?? 0) / max;
        const meaning =
          semanticRanks.get(key)?.hit.score ?? dense.similarity(queryVector, path, sectionId) ?? 0;
        return describe(path, sectionId, fusion.alpha * keyword + (1 - fusion.alpha) * meaning);
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.path.localeCompare(b.path) ||
          a.sectionId.localeCompare(b.sectionId),
      );
  }

  /** Sections containing every quoted phrase verbatim come first, ranked or not. */
  private phrasesFirst(
    ranked: CorpusHit[],
    phrases: string[],
    filter: (path: string) => boolean,
  ): CorpusHit[] {
    const contains = (path: string, sectionId: string) => {
      const text = this.notes.get(path)?.sections.find((section) => section.id === sectionId)?.text;
      const normalized = text === undefined ? "" : normalizePhrase(text);
      return phrases.every((phrase) => normalized.includes(phrase));
    };
    const first = ranked.filter((hit) => contains(hit.path, hit.sectionId));
    const seen = new Set(first.map(sectionKey));
    for (const path of this.paths()) {
      if (!filter(path)) continue;
      for (const section of this.notes.get(path)!.sections)
        if (!seen.has(sectionKey({ path, sectionId: section.id })) && contains(path, section.id))
          first.push({
            path,
            sectionId: section.id,
            score: 0,
            matchedTerms: [],
            lexicalRank: null,
            semanticRank: null,
          });
    }
    return [...first, ...ranked.filter((hit) => !contains(hit.path, hit.sectionId))];
  }
}

/** Text inside straight, curly or CJK double quotes, compared case- and space-insensitively. */
export function quotedPhrases(query: string): string[] {
  return [...query.matchAll(/["“”「」『』]([^"“”「」『』]+)["“”「」『』]/g)]
    .map((match) => normalizePhrase(match[1]!))
    .filter((phrase) => phrase.length > 1);
}

function normalizePhrase(text: string): string {
  return normalizeText(text).replace(/\s+/g, " ").trim();
}

/** A vault path, title or `[[link]]` without brackets, heading, block or alias. */
function linkTarget(target: string): string {
  return target
    .trim()
    .replace(/^!?\[\[|\]\]$/g, "")
    .replace(/[#|^].*$/, "");
}
