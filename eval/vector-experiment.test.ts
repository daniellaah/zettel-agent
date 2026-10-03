import { expect, it } from "vitest";
import { Corpus } from "../src/retrieval/corpus";
import {
  ExactVectorIndex,
  MemoryEmbeddingCache,
  embeddingInput,
  type EmbeddingConfig,
} from "../src/retrieval/vector";
import {
  CachedEmbeddingProvider,
  candidatePool,
  compareRetrievers,
  evaluateReviewedPool,
  experimentBinding,
  HYBRID_PROTOCOL,
  type ReviewedPool,
} from "./vector-experiment";

it("compares prepared lexical/dense/hybrid inputs with offline query caching and no fallback", async () => {
  const corpus = new Corpus({ stageForPath: () => "permanent" });
  corpus.upsert("a.md", "engine facts");
  corpus.upsert("b.md", "unrelated");
  const config: EmbeddingConfig = {
    provider: "fake",
    model: "test",
    modelVersion: "1",
    dimensions: 2,
    normalization: "l2",
    metric: "cosine",
    batchSize: 2,
    timeoutMs: 1000,
  };
  const entries = corpus.paths().flatMap((path) => {
    const note = corpus.get(path)!;
    return note.sections.map((section) => ({
      input: embeddingInput(note, section),
      vector: path === "a.md" ? [1, 0] : [0, 1],
    }));
  });
  const provider = new CachedEmbeddingProvider(config, [
    ...entries,
    { input: "engine", vector: [1, 0] },
  ]);
  expect(() => new CachedEmbeddingProvider(config, [entries[0]!, entries[0]!])).toThrow(
    "Duplicate",
  );
  const index = new ExactVectorIndex(config);
  await index.rebuild(corpus, provider, new MemoryEmbeddingCache());
  const queries = [
    { id: "q1", query: "engine", slice: "exact-term" as const },
    { id: "q2", query: "engine", slice: "cross-language" as const, filters: { folder: "missing" } },
  ];
  const rows = await compareRetrievers(corpus, index, provider, queries);
  expect(rows[0]!.rankings.dense[0]!.path).toBe("a.md");
  expect(rows[1]!.rankings.hybrid).toEqual([]);
  expect(rows[1]!.queryAccounting).toMatchObject({ cacheHit: true, requests: 0, usd: 0 });
  const pool = candidatePool(rows);
  expect(
    pool[0]!.candidates.every(
      (candidate) => candidate.grade === null && candidate.review === "unreviewed",
    ),
  ).toBe(true);
  expect(() => candidatePool([rows[0]!, rows[0]!])).toThrow("Duplicate");
  const labels: ReviewedPool = {
    version: "synthetic-test-v2",
    reviewer: "ai",
    frozen: true,
    corpusRevision: corpus.revision,
    protocolVersion: HYBRID_PROTOCOL.version,
    queryBinding: experimentBinding(rows),
    judgments: { q1: { "a.md": 2, "b.md": 0 }, q2: {} },
  };
  expect(evaluateReviewedPool(rows, labels, corpus.revision, false).retrievalGate).toBe(false);
  expect(evaluateReviewedPool(rows, labels, corpus.revision, true).lexical.recallItems).toBe(1);
  expect(() =>
    evaluateReviewedPool(rows, { ...labels, frozen: false }, corpus.revision, true),
  ).toThrow("Frozen");
  expect(() =>
    evaluateReviewedPool(
      rows,
      { ...labels, judgments: { q1: { "a.md": 2 } } },
      corpus.revision,
      true,
    ),
  ).toThrow("Unreviewed");
  await expect(
    compareRetrievers(corpus, index, provider, [
      { id: "miss", query: "not cached", slice: "paraphrase" },
    ]),
  ).rejects.toThrow("no live fallback");
  await expect(
    compareRetrievers(
      corpus,
      index,
      new CachedEmbeddingProvider({ ...config, modelVersion: "2" }, []),
      [],
    ),
  ).rejects.toThrow("mismatch");
  corpus.remove("a.md");
  await expect(compareRetrievers(corpus, index, provider, [])).rejects.toThrow("current");
});
