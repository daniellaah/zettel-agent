import { STAGES, type Stage } from "../settings";
import { DenseIndex } from "./dense-index";
import { reciprocalRankFusion } from "./fusion";
import { LinkGraph, basenameResolver, type LinkResolver } from "./graph";
import { LexicalIndex, type SearchHit } from "./lexical-index";
import { hash, parseNote, type ParsedNote } from "./markdown";
import type { TokenizerMode } from "./tokenize";

export interface CorpusOptions {
  mode?: TokenizerMode;
  /** Stage from the note's folder; a frontmatter `type` naming a stage overrides it. */
  stageForPath: (path: string) => Stage | null;
  /** Link resolution; defaults to basename matching over the corpus's own notes. */
  resolver?: LinkResolver;
  /** Keep section vectors for semantic and hybrid search. */
  semantic?: boolean;
}

/**
 * lexical: shared words (BM25F). semantic: closeness of meaning (embeddings).
 * hybrid: both candidate lists merged by reciprocal rank fusion.
 */
export type SearchMode = "lexical" | "semantic" | "hybrid";

/** Sections each retriever contributes before fusion. */
export const FUSION_CANDIDATES = 50;

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
  /** Section vectors; null unless the corpus was created with `semantic`. */
  readonly dense: DenseIndex | null;
  private cachedGraph: LinkGraph | null = null;
  private cachedResolver: LinkResolver | null = null;

  constructor(private readonly options: CorpusOptions) {
    this.index = new LexicalIndex(options.mode ?? "both");
    this.dense = options.semantic ? new DenseIndex() : null;
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
    this.index.upsert(note);
    this.dense?.upsert(note);
    this.invalidate();
    return note;
  }

  remove(path: string): void {
    if (!this.notes.delete(path)) return;
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
    const { mode = "lexical", queryVector } = options;
    const limit = options.limit ?? 10;
    const perNote = options.perNote ?? 1;
    const filter = (path: string) => this.eligible(path, options);
    if (mode === "lexical") {
      return this.index
        .search(query, { limit, perNote, filter })
        .map((hit, i) => ({ ...hit, lexicalRank: i + 1, semanticRank: null }));
    }
    if (!this.dense || !queryVector)
      throw new Error(`A ${mode} search needs a semantic corpus and a query vector.`);

    // Fuse section candidates first, so a note's best section from either list can win.
    const semantic = this.dense.search(queryVector, { limit: FUSION_CANDIDATES, filter });
    const lexical =
      mode === "hybrid"
        ? this.index.search(query, {
            limit: FUSION_CANDIDATES,
            perNote: FUSION_CANDIDATES,
            filter,
          })
        : [];
    const matchedTerms = new Map(lexical.map((hit) => [hit.path, hit.matchedTerms]));
    const similarity = new Map(semantic.map((hit) => [`${hit.path}\u0000${hit.sectionId}`, hit]));
    const perPath = new Map<string, number>();
    const hits: CorpusHit[] = [];
    for (const fused of reciprocalRankFusion([lexical, semantic])) {
      const count = perPath.get(fused.path) ?? 0;
      if (count >= perNote) continue;
      perPath.set(fused.path, count + 1);
      hits.push({
        path: fused.path,
        sectionId: fused.sectionId,
        // Semantic alone keeps the cosine similarity; hybrid scores are fusion scores.
        score:
          mode === "semantic"
            ? similarity.get(`${fused.path}\u0000${fused.sectionId}`)!.score
            : fused.score,
        matchedTerms: matchedTerms.get(fused.path) ?? [],
        lexicalRank: fused.ranks[0] ?? null,
        semanticRank: fused.ranks[1] ?? null,
      });
      if (hits.length === limit) break;
    }
    return hits;
  }
}
