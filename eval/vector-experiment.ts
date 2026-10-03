import { pairedBootstrap } from "./paired-bootstrap";
import { hash } from "../src/retrieval/markdown";
import type { Corpus, CorpusSearchOptions } from "../src/retrieval/corpus";
import {
  encode,
  modelIdentity,
  normalizedVector,
  reciprocalRankFusion,
  type EmbeddingConfig,
  type EmbeddingProvider,
  type ExactVectorIndex,
  type VectorHit,
} from "../src/retrieval/vector";
import { meanMeasured, scoreRetrieval } from "./metrics";

/** Predeclared before semantic scores: do not revise thresholds after selecting a winner. */
export const HYBRID_PROTOCOL = Object.freeze({
  version: "hybrid-development-v1",
  fusionConstant: 60,
  candidateDepth: 50,
  cutoff: 10,
  perNote: 1,
  minimumGain: 0.03,
  maximumOtherLoss: 0.02,
  maximumExactSliceLoss: 0.02,
  scanP95TargetMs: 100,
});

/** Immutable cached encoder. Missing inputs throw; replay can never dispatch network requests. */
export class CachedEmbeddingProvider implements EmbeddingProvider {
  readonly mode = "offline";
  private readonly vectors = new Map<string, number[]>();
  constructor(
    readonly config: EmbeddingConfig,
    entries: readonly { input: string; vector: number[] }[],
  ) {
    modelIdentity(config);
    for (const entry of entries) {
      if (this.vectors.has(entry.input)) throw new Error("Duplicate cached embedding input");
      this.vectors.set(entry.input, normalizedVector(entry.vector, config.dimensions));
    }
  }
  embed(texts: readonly string[], signal: AbortSignal) {
    signal.throwIfAborted();
    return Promise.resolve({
      vectors: texts.map((input) => {
        const vector = this.vectors.get(input);
        if (!vector) throw new Error("Offline embedding cache miss; no live fallback");
        return [...vector];
      }),
      usage: { inputTokens: 0, usd: 0 },
    });
  }
}

export interface ExperimentQuery {
  id: string;
  query: string;
  family?: string;
  slice: "exact-term" | "paraphrase" | "cross-language";
  filters?: CorpusSearchOptions;
}
export interface ExperimentRanking {
  id: string;
  family: string;
  slice: ExperimentQuery["slice"];
  query: string;
  filters: CorpusSearchOptions;
  rankings: { lexical: VectorHit[]; dense: VectorHit[]; hybrid: VectorHit[] };
  latencyMs: { queryEmbedding: number; dense: number; lexical: number; hybrid: number };
  queryAccounting: {
    cacheHit: boolean;
    requests: number;
    inputTokens: number | null;
    usd: number | null;
  };
}

/** Prepared index is reused across queries; query encoding remains a separate operation. */
export async function compareRetrievers(
  corpus: Corpus,
  index: ExactVectorIndex,
  provider: EmbeddingProvider,
  queries: readonly ExperimentQuery[],
  signal?: AbortSignal,
  candidatePerNote: number = HYBRID_PROTOCOL.perNote,
  weights: readonly number[] = [1, 1],
): Promise<ExperimentRanking[]> {
  if (index.status(corpus) !== "complete")
    throw new Error("Complete current semantic index required");
  if (modelIdentity(index.config) !== modelIdentity(provider.config))
    throw new Error("Query embedding model mismatch");
  const queryCache = new Map<string, number[]>();
  const results: ExperimentRanking[] = [];
  for (const query of queries) {
    signal?.throwIfAborted();
    const cached = queryCache.get(query.query);
    const embeddingStart = performance.now();
    const encoded = cached ? null : await encode(provider, [query.query], signal);
    const vector = cached ?? encoded!.vectors[0]!;
    queryCache.set(query.query, vector);
    const queryEmbedding = performance.now() - embeddingStart;
    const options = {
      ...query.filters,
      limit: HYBRID_PROTOCOL.candidateDepth,
      perNote: candidatePerNote,
    };
    let start = performance.now();
    const dense = index.search(corpus, vector, options);
    const denseMs = performance.now() - start;
    start = performance.now();
    const lexical = corpus.search(query.query, options).map((hit) => ({
      path: hit.path,
      sectionId: hit.sectionId,
      score: hit.score,
      contentHash: corpus.get(hit.path)!.contentHash,
    }));
    const lexicalMs = performance.now() - start;
    start = performance.now();
    const hybrid = reciprocalRankFusion(
      [lexical, dense],
      HYBRID_PROTOCOL.cutoff,
      HYBRID_PROTOCOL.fusionConstant,
      HYBRID_PROTOCOL.perNote,
      weights,
    );
    results.push({
      id: query.id,
      family: query.family ?? query.id,
      query: query.query,
      slice: query.slice,
      filters: query.filters ?? {},
      rankings: {
        lexical: lexical.slice(0, HYBRID_PROTOCOL.cutoff),
        dense: dense.slice(0, HYBRID_PROTOCOL.cutoff),
        hybrid,
      },
      latencyMs: {
        queryEmbedding,
        dense: denseMs,
        lexical: lexicalMs,
        hybrid: performance.now() - start,
      },
      queryAccounting: {
        cacheHit: !!cached,
        requests: cached ? 0 : 1,
        inputTokens: encoded?.usage.inputTokens ?? (cached ? 0 : null),
        usd: encoded?.usage.usd ?? (cached ? 0 : null),
      },
    });
  }
  return results;
}

/** Pool manifests contain candidates for review, never fabricated relevance labels. */
export function candidatePool(rankings: readonly ExperimentRanking[]) {
  const ids = new Set<string>();
  return rankings.map((row) => {
    if (ids.has(row.id)) throw new Error("Duplicate query id");
    ids.add(row.id);
    return {
      id: row.id,
      family: row.family,
      query: row.query,
      slice: row.slice,
      filters: row.filters,
      candidates: [
        ...new Set(Object.values(row.rankings).flatMap((hits) => hits.map((hit) => hit.path))),
      ]
        .sort()
        .map((path) => ({
          path,
          grade: null,
          review: "unreviewed",
          retrievedBy: Object.entries(row.rankings)
            .filter(([, hits]) => hits.some((hit) => hit.path === path))
            .map(([mode]) => mode),
        })),
    };
  });
}

export interface ReviewedPool {
  version: string;
  reviewer: "ai" | "human";
  frozen: boolean;
  corpusRevision: string;
  protocolVersion: string;
  queryBinding: string;
  /** Complete positive annotations plus reviewed union of top-ten candidates. */
  judgments: Record<string, Record<string, 0 | 1 | 2>>;
}

/** Quality scoring is withheld without a common frozen pool; unknown is never negative. */
export function evaluateReviewedPool(
  rankings: readonly ExperimentRanking[],
  pool: ReviewedPool,
  corpusRevision: string,
  semanticModel: boolean,
  protocolVersion: string = HYBRID_PROTOCOL.version,
) {
  if (
    !pool.version ||
    !pool.frozen ||
    pool.corpusRevision !== corpusRevision ||
    pool.protocolVersion !== protocolVersion ||
    pool.queryBinding !== experimentBinding(rankings)
  )
    throw new Error("Frozen matching versioned pool required");
  const rows = rankings.map((row) => {
    const grades = pool.judgments[row.id];
    if (!grades || Object.values(grades).some((grade) => ![0, 1, 2].includes(grade)))
      throw new Error("Invalid reviewed labels");
    for (const hit of Object.values(row.rankings).flat())
      if (!(hit.path in grades)) throw new Error("Unreviewed pooled candidate; no promotion score");
    return {
      id: row.id,
      family: row.family,
      slice: row.slice,
      scores: Object.fromEntries(
        Object.entries(row.rankings).map(([mode, hits]) => [
          mode,
          scoreRetrieval(
            hits.map((hit) => hit.path),
            grades,
          ),
        ]),
      ),
    };
  });
  const aggregate = (mode: string, slice?: string) => {
    const selected = rows.filter((row) => !slice || row.slice === slice);
    const scores = selected.map((row) => row.scores[mode]!);
    return {
      items: scores.length,
      recallItems: scores.filter((score) => score.recall10 !== null).length,
      mrrItems: scores.filter((score) => score.mrr !== null).length,
      recall10: meanMeasured(scores.map((score) => score.recall10)),
      mrr10: meanMeasured(scores.map((score) => score.mrr)),
    };
  };
  const lexical = aggregate("lexical");
  const hybrid = aggregate("hybrid");
  const exactLexical = aggregate("lexical", "exact-term");
  const exactHybrid = aggregate("hybrid", "exact-term");
  const recallGain =
    lexical.recall10 === null || hybrid.recall10 === null
      ? null
      : hybrid.recall10 - lexical.recall10;
  const mrrGain =
    lexical.mrr10 === null || hybrid.mrr10 === null ? null : hybrid.mrr10 - lexical.mrr10;
  const exactLoss = Math.max(
    (exactLexical.recall10 ?? 0) - (exactHybrid.recall10 ?? 0),
    (exactLexical.mrr10 ?? 0) - (exactHybrid.mrr10 ?? 0),
  );
  const retrievalGate =
    semanticModel &&
    exactLexical.recallItems > 0 &&
    recallGain !== null &&
    mrrGain !== null &&
    ((recallGain >= HYBRID_PROTOCOL.minimumGain && mrrGain >= -HYBRID_PROTOCOL.maximumOtherLoss) ||
      (mrrGain >= HYBRID_PROTOCOL.minimumGain &&
        recallGain >= -HYBRID_PROTOCOL.maximumOtherLoss)) &&
    exactLoss <= HYBRID_PROTOCOL.maximumExactSliceLoss;
  return {
    labelVersion: pool.version,
    reviewer: pool.reviewer,
    rows,
    lexical,
    dense: aggregate("dense"),
    hybrid,
    slices: ["exact-term", "paraphrase", "cross-language"].map((slice) => ({
      slice,
      lexical: aggregate("lexical", slice),
      dense: aggregate("dense", slice),
      hybrid: aggregate("hybrid", slice),
    })),
    retrievalGate,
    uncertainty: {
      method:
        "seeded paired source-family cluster bootstrap; descriptive, AI-label uncertainty not calibrated",
      recallGain: pairedBootstrap(
        rows.map((row) => ({
          group: row.family,
          lexical: row.scores.lexical!.recall10,
          hybrid: row.scores.hybrid!.recall10,
        })),
      ),
      mrrGain: pairedBootstrap(
        rows.map((row) => ({
          group: row.family,
          lexical: row.scores.lexical!.mrr,
          hybrid: row.scores.hybrid!.mrr,
        })),
      ),
    },
    promotion:
      "pending paired answer grounding, citation, cost/latency evaluation and a fresh final checkpoint; retrieval gate alone cannot promote production",
  };
}

/** Freeze the query/filter/family/slice identities with the new common label version. */
export function experimentBinding(rankings: readonly ExperimentRanking[]): string {
  return hash(
    JSON.stringify(
      rankings.map(({ id, family, query, filters, slice }) => ({
        id,
        family,
        query,
        filters,
        slice,
      })),
    ),
  );
}
