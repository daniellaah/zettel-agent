import { STAGES, type Stage } from "../settings";
import { DenseIndex } from "./dense-index";
import { reciprocalRankFusion, RRF_K } from "./fusion";
import { LinkGraph, basenameResolver, type LinkResolver } from "./graph";
import { LexicalIndex, type LexicalOptions, type SearchHit } from "./lexical-index";
import { hash, parseNote, type ParsedNote } from "./markdown";
import { normalizeText, textLanguage, type TokenizerMode } from "./tokenize";

export interface CorpusOptions {
  mode?: TokenizerMode;
  /** Stage from the note's folder; a frontmatter `type` naming a stage overrides it. */
  stageForPath: (path: string) => Stage | null;
  /** Link resolution; defaults to basename matching over the corpus's own notes. */
  resolver?: LinkResolver;
  /** Keep section vectors for semantic and hybrid search. */
  semantic?: boolean;
  /** Keyword-index switches for ablations; all on by default. */
  lexical?: LexicalOptions;
  /** In lexical and hybrid search, rank sections containing quoted phrases first. Default on. */
  phrases?: boolean;
}

/**
 * lexical: shared words (BM25F). semantic: closeness of meaning (embeddings).
 * hybrid: both candidate lists merged by reciprocal rank fusion.
 */
export type SearchMode = "lexical" | "semantic" | "hybrid";

/** Sections each retriever contributes before fusion. */
export const FUSION_CANDIDATES = 50;

/**
 * How hybrid search merges its two lists. rrf: reciprocal rank fusion of ranks only.
 * convex: alpha × BM25 normalized by the query's highest possible score + (1 − alpha) ×
 * cosine similarity.
 */
export type Fusion = { method: "rrf"; k: number } | { method: "convex"; alpha: number };

export const DEFAULT_FUSION: Fusion = { method: "rrf", k: RRF_K };

export interface CorpusSearchOptions {
  limit?: number | undefined;
  perNote?: number | undefined;
  stages?: Stage[] | undefined;
  /** Vault-relative folder prefix. */
  folder?: string | undefined;
  tag?: string | undefined;
  /** Default lexical. Semantic and hybrid need `queryVector` and a `semantic` corpus. */
  mode?: SearchMode | undefined;
  /** The query embedded with the same embedder as the corpus's sections. */
  queryVector?: Float32Array | undefined;
  fusion?: Fusion | undefined;
  /**
   * The same question in other words or languages, searched together with the query:
   * keywords from all of them, and each section's closest query vector.
   */
  alternates?: { query: string; queryVector?: Float32Array }[] | undefined;
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
    this.index = new LexicalIndex(options.mode ?? "both", options.lexical);
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
    const cleaned = target
      .trim()
      .replace(/^!?\[\[|\]\]$/g, "")
      .replace(/[#|^].*$/, "");
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
    const stage =
      note.type && (STAGES as readonly string[]).includes(note.type)
        ? note.type
        : this.options.stageForPath(path);
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

  rename(oldPath: string, newPath: string, content: string): void {
    this.remove(oldPath);
    this.upsert(newPath, content);
  }

  private invalidate(): void {
    this.cachedGraph = null;
    // A custom resolver (Obsidian's) tracks vault changes itself; the fallback must be rebuilt.
    if (!this.options.resolver) this.cachedResolver = null;
  }

  stage(path: string): Stage | null {
    const type = this.notes.get(path)?.type;
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
    const cleaned = target
      .trim()
      .replace(/^!?\[\[|\]\]$/g, "")
      .replace(/[#|^].*$/, "");
    if (this.notes.has(cleaned)) return cleaned;
    if (this.notes.has(`${cleaned}.md`)) return `${cleaned}.md`;
    this.cachedResolver ??= this.options.resolver ?? basenameResolver(this.notes.keys());
    const resolved = this.cachedResolver(cleaned, sourcePath);
    return resolved !== null && this.notes.has(resolved) ? resolved : null;
  }

  search(query: string, options: CorpusSearchOptions = {}): CorpusHit[] {
    const filter = (path: string) => this.eligible(path, options);
    let ranked = this.rank(query, options, filter);
    // Quotes ask for exact text, which pure semantic search does not promise.
    const phrases =
      this.options.phrases === false || options.mode === "semantic" ? [] : quotedPhrases(query);
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
    options: CorpusSearchOptions,
    filter: (path: string) => boolean,
  ): CorpusHit[] {
    const { mode = "lexical", queryVector, fusion = DEFAULT_FUSION } = options;
    const all = { limit: Number.MAX_SAFE_INTEGER, perNote: Number.MAX_SAFE_INTEGER, filter };
    const alternates = options.alternates ?? [];
    const keywords = [query, ...alternates.map((alternate) => alternate.query)].join("\n");
    const lexical = mode === "semantic" ? [] : this.index.search(keywords, all);
    if (mode === "lexical")
      return lexical.map((hit, i) => ({ ...hit, lexicalRank: i + 1, semanticRank: null }));
    if (!this.dense || !queryVector)
      throw new Error(`A ${mode} search needs a semantic corpus and a query vector.`);
    const dense = this.dense;
    const vectors = [
      queryVector,
      ...alternates.flatMap((a) => (a.queryVector ? [a.queryVector] : [])),
    ];
    const semantic = dense.search(vectors, all);

    const id = (hit: { path: string; sectionId: string }) => `${hit.path}\u0000${hit.sectionId}`;
    const lexicalRanks = new Map(lexical.map((hit, i) => [id(hit), { hit, rank: i + 1 }]));
    const semanticRanks = new Map(semantic.map((hit, i) => [id(hit), { hit, rank: i + 1 }]));
    const matchedTerms = new Map(lexical.map((hit) => [hit.path, hit.matchedTerms]));
    const describe = (path: string, sectionId: string, score: number): CorpusHit => {
      const key = id({ path, sectionId });
      return {
        path,
        sectionId,
        score,
        matchedTerms: matchedTerms.get(path) ?? [],
        lexicalRank: lexicalRanks.get(key)?.rank ?? null,
        semanticRank: semanticRanks.get(key)?.rank ?? null,
      };
    };
    // Semantic alone keeps the cosine similarity as its score.
    if (mode === "semantic")
      return semantic.map((hit) => describe(hit.path, hit.sectionId, hit.score));

    const top = [lexical, semantic].map((list) => list.slice(0, FUSION_CANDIDATES));
    if (fusion.method === "rrf")
      return reciprocalRankFusion(top, fusion.k).map((fused) =>
        describe(fused.path, fused.sectionId, fused.score),
      );

    // Convex combination: BM25 divided by the query's highest possible score, so keywords
    // weigh in only as far as the query's terms actually matched, plus cosine similarity.
    const max = this.index.maxScore(keywords) || 1;
    const candidates = new Map(top.flat().map((hit) => [id(hit), hit]));
    return [...candidates.values()]
      .map(({ path, sectionId }) => {
        const key = id({ path, sectionId });
        const keyword = (lexicalRanks.get(key)?.hit.score ?? 0) / max;
        const meaning =
          semanticRanks.get(key)?.hit.score ?? dense.similarity(vectors, path, sectionId) ?? 0;
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
    const seen = new Set(first.map((hit) => `${hit.path}\u0000${hit.sectionId}`));
    for (const path of this.paths()) {
      if (!filter(path)) continue;
      for (const section of this.notes.get(path)!.sections)
        if (!seen.has(`${path}\u0000${section.id}`) && contains(path, section.id))
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
