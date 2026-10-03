import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { format } from "prettier";
import { expect, it } from "vitest";
import { Corpus } from "../src/retrieval/corpus";
import {
  ExactVectorIndex,
  MemoryEmbeddingCache,
  encode,
  type EmbeddingConfig,
} from "../src/retrieval/vector";
import { executeTool } from "../src/agent/tools";
import { EvidenceLedger } from "../src/agent/evidence";
import { loadEvaluationData, loadFixtureCorpus, VAULT_DIR } from "./fixture-vault";
import { FileEmbeddingCache } from "./vector-cache";
import {
  CachedEmbeddingProvider,
  candidatePool,
  experimentBinding,
  compareRetrievers,
  HYBRID_PROTOCOL,
  type ExperimentQuery,
} from "./vector-experiment";
import { FakeBenchmarkEmbeddings, percentile } from "./vector-benchmark";
import { reportDestination } from "./report-destination";

it("benchmarks offline vector/cache mechanics and produces an unreviewed hybrid pool", async () => {
  const corpus = loadFixtureCorpus();
  const data = loadEvaluationData("expanded");
  const config: EmbeddingConfig = {
    provider: "offline-test",
    model: "pseudorandom-mechanics-only",
    modelVersion: "1",
    dimensions: 1536,
    normalization: "l2",
    metric: "cosine",
    batchSize: 64,
    timeoutMs: 10_000,
  };
  const encoder = new FakeBenchmarkEmbeddings(config);
  const index = new ExactVectorIndex(config);
  const temporary = await mkdtemp(path.join(os.tmpdir(), "zettel-vector-benchmark-"));
  try {
    const cache = await FileEmbeddingCache.open(path.join(temporary, "cache"), VAULT_DIR);
    const first = await index.rebuild(corpus, encoder, cache);
    const warm = await index.rebuild(corpus, encoder, cache);
    expect(warm.requests).toBe(0);
    expect(warm.cachedSections).toBe(index.size);
    const queries: ExperimentQuery[] = data.retrieval.items
      .filter((item) => item.split === "dev")
      .map((item) => ({
        id: item.id,
        query: item.query,
        family: item.family,
        slice: item.kind === "lookup" ? "exact-term" : "paraphrase",
      }));
    queries.push(...queries.slice(0, 6).map((q) => ({ ...q, id: `${q.id}-cache-repeat` })), {
      id: "mechanics-cross-language",
      query: "如何区分采样误差和模型误差",
      slice: "cross-language",
    });
    // Immutable offline encoder reuses section vectors and encoded query inputs.
    const encodedQueries = await encode(
      encoder,
      queries.map((q) => q.query),
    );
    const allInputs = new Map(index.snapshot().map((record) => [record.input, record.vector]));
    queries.forEach((query, i) => allInputs.set(query.query, encodedQueries.vectors[i]!));
    const offline = new CachedEmbeddingProvider(
      config,
      [...allInputs].map(([input, vector]) => ({ input, vector })),
    );
    const rankings = await compareRetrievers(corpus, index, offline, queries);
    const pool = candidatePool(rankings);
    const repeatHits = rankings.filter((row) => row.queryAccounting.cacheHit).length;
    const lexicalSections = data.retrieval.items
      .filter((q) => q.split === "dev")
      .map((q) => {
        const run = (per_note: number) =>
          executeTool(
            "search",
            { query: q.query, limit: 8, per_note },
            { corpus, ledger: new EvidenceLedger() },
          );
        const baseline = run(1);
        const multiple = run(3);
        return {
          id: q.id,
          single: {
            sections: baseline.contract!.returned.count,
            paths: [...new Set(baseline.contract!.exposures.map((s) => s.path))],
            outputChars: baseline.content.length,
          },
          multiple: {
            sections: multiple.contract!.returned.count,
            paths: [...new Set(multiple.contract!.exposures.map((s) => s.path))],
            outputChars: multiple.content.length,
          },
        };
      });
    // A synthetic 10x corpus measures scanning mechanics only, not representative owner vault quality.
    const expanded = new Corpus({ stageForPath: () => "permanent" });
    for (let copy = 0; copy < 10; copy++)
      for (const file of corpus.paths()) {
        const note = corpus.get(file)!;
        expanded.upsert(
          `scale-${copy}/${file}`,
          note.sections.map((section) => section.text).join("\n"),
        );
      }
    const scaleIndex = new ExactVectorIndex(config);
    const scaleBuild = await scaleIndex.rebuild(expanded, encoder, new MemoryEmbeddingCache());
    const timings: number[] = [];
    const vector = encodedQueries.vectors[0]!;
    for (let i = 0; i < 30; i++) {
      const start = performance.now();
      scaleIndex.search(expanded, vector, { limit: 10, ...(i % 2 ? { folder: "scale-0" } : {}) });
      timings.push(performance.now() - start);
    }
    const implementation = Object.fromEntries(
      await Promise.all(
        [
          "src/retrieval/vector.ts",
          "src/retrieval/corpus.ts",
          "src/agent/tools.ts",
          "src/agent/tool-contract.ts",
          "src/agent/evidence.ts",
          "src/retrieval/markdown.ts",
          "src/retrieval/lexical-index.ts",
          "src/retrieval/tokenize.ts",
          "eval/paired-bootstrap.ts",
          "eval/vector-experiment.ts",
          "eval/vector-cache.ts",
          "eval/vector-benchmark.ts",
          "eval/vector.run.ts",
        ].map(
          async (file) =>
            [
              file,
              createHash("sha256")
                .update(await readFile(path.resolve(import.meta.dirname, "..", file)))
                .digest("hex"),
            ] as const,
        ),
      ),
    );
    const report = {
      schema: 1,
      status: "offline fake-vector mechanics only; semantic quality and promotion unmeasured",
      apiCalls: 0,
      corpusId: data.manifest.corpusId,
      corpusHash: data.manifest.corpusHash,
      corpusRevision: corpus.revision,
      implementation,
      model: config,
      representation: "title-heading-body-v1; exact encoder inputs stored in cache",
      protocol: HYBRID_PROTOCOL,
      queryBinding: experimentBinding(rankings),
      hardware: {
        platform: os.platform(),
        arch: os.arch(),
        cpu: os.cpus()[0]?.model,
        logicalCpus: os.cpus().length,
        ramBytes: os.totalmem(),
        node: process.version,
      },
      sections: index.size,
      notes: corpus.size,
      vectorPayloadBytes: index.vectorBytes,
      processRssBytes: process.memoryUsage().rss,
      indexing: { first, warm },
      queryEmbedding: {
        logicalRequests: rankings.reduce((sum, row) => sum + row.queryAccounting.requests, 0),
        cacheHits: repeatHits,
        apiRequests: 0,
        usd: 0,
        p50Ms: percentile(
          rankings.map((r) => r.latencyMs.queryEmbedding),
          0.5,
        ),
        p95Ms: percentile(
          rankings.map((r) => r.latencyMs.queryEmbedding),
          0.95,
        ),
      },
      exactScan: {
        p50Ms: percentile(
          rankings.map((r) => r.latencyMs.dense),
          0.5,
        ),
        p95Ms: percentile(
          rankings.map((r) => r.latencyMs.dense),
          0.95,
        ),
      },
      synthetic10x: {
        notes: expanded.size,
        sections: scaleIndex.size,
        vectorPayloadBytes: scaleIndex.vectorBytes,
        rebuildMs: scaleBuild.elapsedMs,
        trials: timings.length,
        workload: "alternating all notes and one copy-folder filter, limit 10; fake vectors",
        p50Ms: percentile(timings, 0.5),
        p95Ms: percentile(timings, 0.95),
      },
      lexicalSections,
      rankings,
      poolReview: "unreviewed; fake vectors cannot create semantic relevance labels",
      qualityMetrics: null,
      productionPromotion: false,
    };
    const out = reportDestination(import.meta.dirname, process.env.EVAL_REPORT_DIR);
    await mkdir(out, { recursive: true });
    await writeFile(
      path.join(out, "vector-mechanics.json"),
      await format(JSON.stringify(report), { parser: "json" }),
    );
    await writeFile(
      path.join(out, "fake-vector-pool.json"),
      await format(
        JSON.stringify({
          schema: 1,
          protocol: HYBRID_PROTOCOL,
          queryBinding: experimentBinding(rankings),
          corpusRevision: corpus.revision,
          status: "test-vector mechanics pool; do not judge or promote as semantic retrieval",
          queries: pool,
        }),
        { parser: "json" },
      ),
    );
    console.log(
      JSON.stringify(
        {
          notes: report.notes,
          sections: report.sections,
          first: report.indexing.first,
          warm: report.indexing.warm,
          exactScan: report.exactScan,
          synthetic10x: report.synthetic10x,
          cacheHits: repeatHits,
          apiCalls: 0,
          reports: out,
        },
        null,
        2,
      ),
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}, 120_000);
