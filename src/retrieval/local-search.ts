import type { Corpus, CorpusSearchOptions } from "./corpus";
import type { SearchHit } from "./lexical-index";
import { QUERY_INSTRUCTION } from "./ollama";
import {
  encode,
  modelIdentity,
  reciprocalRankFusion,
  type EmbeddingProvider,
  type ExactVectorIndex,
} from "./vector";

/** Frozen development selection; BM25 remains the default retrieval mode. */
export const LOCAL_HYBRID_WEIGHTS: readonly number[] = Object.freeze([1, 2]);

export interface PreparedSearch {
  hits: SearchHit[];
  mode: "lexical" | "hybrid";
  revision: string;
  candidateSemantics: "exact" | "lower-bound";
  fallback?: string;
}
export type SearchPort = (
  corpus: Corpus,
  query: string,
  options: CorpusSearchOptions,
  signal?: AbortSignal,
) => Promise<PreparedSearch>;

/** Query-only port: never rebuilds an index, opens a filesystem or writes a cache file. */
export class LocalHybridSearch {
  private readonly queries = new Map<string, number[]>();
  constructor(
    private readonly index: ExactVectorIndex,
    private readonly provider: EmbeddingProvider,
    private readonly checkIdentity: (signal?: AbortSignal) => Promise<void> = async () => {},
  ) {
    if (modelIdentity(index.config) !== modelIdentity(provider.config))
      throw new Error("Query embedding model configuration mismatch");
  }
  async search(
    corpus: Corpus,
    query: string,
    options: CorpusSearchOptions = {},
    signal?: AbortSignal,
  ): Promise<PreparedSearch> {
    const revision = corpus.revision;
    const lexical = () => corpus.search(query, { ...options, limit: Number.MAX_SAFE_INTEGER });
    try {
      signal?.throwIfAborted();
      if (this.index.status(corpus) !== "complete")
        throw new Error(`Local semantic index ${this.index.status(corpus)}; build it in Settings`);
      await this.checkIdentity(signal);
      let vector = this.queries.get(query);
      if (!vector) {
        vector = (await encode(this.provider, [QUERY_INSTRUCTION + query], signal)).vectors[0]!;
        this.queries.set(query, vector);
        if (this.queries.size > 128) this.queries.delete(this.queries.keys().next().value!);
      }
      signal?.throwIfAborted();
      if (corpus.revision !== revision)
        throw new Error("Research corpus changed during query embedding");
      // Keep multiple section candidates before the final per-note collapse.
      const candidates = { ...options, limit: 50, perNote: 5 };
      const bm25 = corpus.search(query, candidates);
      const dense = this.index.search(corpus, vector, candidates);
      const notes = new Map(lexical().map((hit) => [hit.path, hit.matchedTerms]));
      const hits = reciprocalRankFusion(
        [bm25.map((hit) => ({ ...hit, contentHash: corpus.get(hit.path)!.contentHash })), dense],
        100,
        60,
        options.perNote ?? 1,
        LOCAL_HYBRID_WEIGHTS,
      ).map((hit) => ({ ...hit, matchedTerms: notes.get(hit.path) ?? [] }));
      return { hits, mode: "hybrid", revision, candidateSemantics: "lower-bound" };
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      return {
        hits: lexical(),
        mode: "lexical",
        revision: corpus.revision,
        candidateSemantics: "exact",
        fallback: error instanceof Error ? error.message : "Local semantic retrieval unavailable",
      };
    }
  }
}
