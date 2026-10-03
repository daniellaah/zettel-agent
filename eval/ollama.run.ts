import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { format } from "prettier";
import { expect, it } from "vitest";
import { OllamaEmbeddingProvider, QUERY_INSTRUCTION } from "../src/retrieval/ollama";
import { LocalHybridSearch } from "../src/retrieval/local-search";
import { ExactVectorIndex, encode } from "../src/retrieval/vector";
import { FileEmbeddingCache } from "../src/vault/embedding-cache";
import { localOllamaFetch } from "../src/vault/local-http";
import { executeToolAsync } from "../src/agent/tools";
import { EvidenceLedger } from "../src/agent/evidence";
import { loadFixtureCorpus, loadEvaluationData, VAULT_DIR } from "./fixture-vault";
import {
  candidatePool,
  compareRetrievers,
  experimentBinding,
  HYBRID_PROTOCOL,
} from "./vector-experiment";
import { reportDestination } from "./report-destination";
import { percentile } from "./vector-benchmark";

it("builds genuine local Qwen vectors and compares development rankings without paid calls", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "zettel-ollama-eval-"));
  try {
    const corpus = loadFixtureCorpus();
    const data = loadEvaluationData("expanded");
    const provider = await OllamaEmbeddingProvider.connect(
      "http://127.0.0.1:11434",
      localOllamaFetch,
    );
    const cache = await FileEmbeddingCache.open(path.join(directory, "cache"), VAULT_DIR);
    const index = new ExactVectorIndex(provider.config);
    const first = await index.rebuild(corpus, provider, cache);
    console.log(
      `local Ollama: ${index.size} sections encoded in ${(first.elapsedMs / 1000).toFixed(1)}s`,
    );
    const warm = await index.rebuild(corpus, provider, cache);
    expect(warm.requests).toBe(0);
    expect(warm.cachedSections).toBe(index.size);
    const queries = data.retrieval.items
      .filter((item) => item.split === "dev")
      .map((item) => ({
        id: item.id,
        query: item.query,
        family: item.family,
        slice: item.kind === "lookup" ? ("exact-term" as const) : ("paraphrase" as const),
      }));
    queries.push({
      id: "local-cross-language",
      query: "为什么要把检索召回和答案证据支持分开评估？",
      family: "local-mechanics",
      slice: "paraphrase",
    });
    // Development evaluator and production query adapter use the same fixed instruction.
    const queryProvider = {
      config: provider.config,
      mode: provider.mode,
      embed: (texts: readonly string[], signal: AbortSignal) =>
        provider.embed(
          texts.map((text) => QUERY_INSTRUCTION + text),
          signal,
        ),
    };
    const rankings = await compareRetrievers(corpus, index, queryProvider, queries, undefined, 5);
    const reader = new LocalHybridSearch(index, provider, (signal) =>
      provider.assertIdentity(signal),
    );
    const outcome = await executeToolAsync(
      "search",
      { query: queries.at(-1)!.query, limit: 8 },
      { corpus, ledger: new EvidenceLedger(), search: reader.search.bind(reader) },
    );
    expect(outcome.isError).toBe(false);
    expect(outcome.contract?.effective.mode).toBe("hybrid");
    expect(outcome.contract?.exposures.some((span) => span.scope === "excerpt")).toBe(true);
    const raw = await encode(queryProvider, [queries[0]!.query]);
    const durations: number[] = [];
    for (let i = 0; i < 30; i++) {
      const started = performance.now();
      index.search(corpus, raw.vectors[0]!, { limit: 10 });
      durations.push(performance.now() - started);
    }
    const files = [
      "src/retrieval/ollama.ts",
      "src/retrieval/local-search.ts",
      "src/retrieval/vector.ts",
      "src/agent/tools.ts",
      "src/agent/loop.ts",
      "src/vault/embedding-cache.ts",
      "src/vault/local-http.ts",
      "eval/ollama.run.ts",
      "eval/vector-experiment.ts",
    ];
    const implementation = Object.fromEntries(
      await Promise.all(
        files.map(
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
      status:
        "Genuine local vectors; pooled judgments, paired answer quality and fresh checkpoint pending. No promotion claim.",
      createdAt: new Date().toISOString(),
      cloudCalls: 0,
      embeddingUsd: 0,
      corpusId: data.manifest.corpusId,
      corpusHash: data.manifest.corpusHash,
      corpusRevision: corpus.revision,
      model: provider.config,
      implementation,
      sections: index.size,
      notes: corpus.size,
      vectorPayloadBytes: index.vectorBytes,
      first,
      warm,
      protocol: { ...HYBRID_PROTOCOL, version: "local-qwen-development-v1", candidatePerNote: 5 },
      queryInstruction: QUERY_INSTRUCTION,
      queryBinding: experimentBinding(rankings),
      scanMs: { p50: percentile(durations, 0.5), p95: percentile(durations, 0.95) },
      rankings,
      tool: {
        mode: outcome.contract!.effective.mode,
        returned: outcome.contract!.returned.count,
        outputChars: outcome.content.length,
      },
    };
    const destination = reportDestination(
      import.meta.dirname,
      process.env.EVAL_REPORT_DIR ?? path.join(import.meta.dirname, "reports/ollama-local"),
    );
    await mkdir(destination, { recursive: true });
    for (const [file, value] of [
      ["local-vector.json", report],
      [
        "local-pool.json",
        {
          schema: 1,
          status: "unreviewed",
          model: provider.config,
          corpusRevision: corpus.revision,
          queryBinding: report.queryBinding,
          candidates: candidatePool(rankings),
        },
      ],
    ] as const)
      await writeFile(
        path.join(destination, file),
        await format(JSON.stringify(value), { parser: "json" }),
      );
    console.log(
      JSON.stringify({
        notes: corpus.size,
        sections: index.size,
        first,
        warm,
        scanMs: report.scanMs,
        report: destination,
      }),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 900_000);
