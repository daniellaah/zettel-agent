import { expect, it, vi } from "vitest";
import { Corpus } from "./corpus";
import { LocalHybridSearch } from "./local-search";
import { QUERY_INSTRUCTION } from "./ollama";
import { ExactVectorIndex, MemoryEmbeddingCache, type EmbeddingProvider } from "./vector";
import { EvidenceLedger } from "../agent/evidence";
import { executeToolAsync } from "../agent/tools";

async function fixture() {
  const corpus = new Corpus({ stageForPath: () => "permanent" });
  corpus.upsert("P/Memory.md", "# Memory\nSpaced practice improves recall.");
  corpus.upsert("Q/Storage.md", "# Storage\nAn SSD stores files.");
  const embed = vi.fn<EmbeddingProvider["embed"]>((texts) =>
    Promise.resolve({
      vectors: texts.map((input) => (input.includes("SSD") ? [0, 1] : [1, 0])),
      usage: { inputTokens: 10, usd: 0 },
    }),
  );
  const provider: EmbeddingProvider = {
    mode: "live",
    config: {
      provider: "test",
      model: "test",
      modelVersion: "1",
      dimensions: 2,
      normalization: "l2",
      metric: "cosine",
      batchSize: 8,
      timeoutMs: 1000,
    },
    embed,
  };
  const index = new ExactVectorIndex(provider.config);
  await index.rebuild(corpus, provider, new MemoryEmbeddingCache());
  embed.mockClear();
  const check = vi.fn(async () => {});
  const reader = new LocalHybridSearch(index, provider, check);
  return { corpus, embed, reader, check, index };
}
it("retrieves semantic candidates without inventing lexical terms, caches queries and preserves filters", async () => {
  const { corpus, embed, reader, check } = await fixture();
  const result = await reader.search(corpus, "记忆");
  expect(result.hits[0]!.path).toBe("P/Memory.md");
  expect(result.hits[0]!.matchedTerms).toEqual([]);
  expect(result.candidateSemantics).toBe("lower-bound");
  expect(embed.mock.calls[0]![0]).toEqual([QUERY_INSTRUCTION + "记忆"]);
  expect(
    (await reader.search(corpus, "记忆", { folder: "Q" })).hits.map((hit) => hit.path),
  ).toEqual(["Q/Storage.md"]);
  expect(embed).toHaveBeenCalledTimes(1);
  expect(check).toHaveBeenCalledTimes(2);
});
it("falls back explicitly for stale indexes and model changes, while cancellation never falls back", async () => {
  const { corpus, embed, reader, check } = await fixture();
  await reader.search(corpus, "recall");
  check.mockRejectedValue(new Error("Model changed"));
  const changed = await reader.search(corpus, "recall");
  expect(changed).toMatchObject({
    mode: "lexical",
    fallback: "Model changed",
    candidateSemantics: "exact",
  });
  corpus.upsert("P/Memory.md", "# Memory\nRecall changed.");
  expect((await reader.search(corpus, "recall")).fallback).toContain("stale");
  expect(embed).toHaveBeenCalledTimes(1);
  const controller = new AbortController();
  controller.abort(new Error("stop"));
  await expect(reader.search(corpus, "recall", {}, controller.signal)).rejects.toThrow("stop");
});
it("delivers semantic excerpts through bounded transactional tool contracts", async () => {
  const { corpus, reader } = await fixture();
  const context = { corpus, ledger: new EvidenceLedger(), search: reader.search.bind(reader) };
  const result = await executeToolAsync("search", { query: "记忆" }, context);
  expect(result.isError).toBe(false);
  expect(result.contract).toMatchObject({
    effective: { mode: "hybrid" },
    candidates: { semantics: "lower-bound" },
  });
  expect(result.content).toContain("Spaced practice");
  expect(result.content).not.toContain("lexical score");
  const ledger = new EvidenceLedger();
  const limited = await executeToolAsync(
    "search",
    { query: "记忆" },
    { ...context, ledger, maxChars: 20 },
  );
  expect(limited.isError).toBe(true);
  expect(ledger.size).toBe(0);
  corpus.remove("P/Memory.md");
  const stale = await executeToolAsync("search", { query: "SSD" }, context);
  expect(stale.contract?.effective).toMatchObject({ mode: "lexical" });
  expect(stale.content).toContain("using lexical search");
});

it("rejects an index/query model mismatch before embedding", async () => {
  const { index, embed } = await fixture();
  expect(
    () =>
      new LocalHybridSearch(index, {
        config: { ...index.config, modelVersion: "different" },
        mode: "live",
        embed,
      }),
  ).toThrow("mismatch");
});

it("uses the development-selected dense weight when lexical and semantic orders conflict", async () => {
  const corpus = new Corpus({ stageForPath: () => "permanent" });
  for (const name of ["A", "M", "Z"]) corpus.upsert(`${name}.md`, `# ${name}\nEvidence ${name}.`);
  const provider: EmbeddingProvider = {
    mode: "live",
    config: {
      provider: "test",
      model: "test",
      modelVersion: "1",
      dimensions: 2,
      normalization: "l2",
      metric: "cosine",
      batchSize: 8,
      timeoutMs: 1000,
    },
    embed: (texts) =>
      Promise.resolve({
        vectors: texts.map((text) =>
          text.includes("Evidence A")
            ? [0, 1]
            : text.includes("Evidence M")
              ? [0.5, Math.sqrt(0.75)]
              : [1, 0],
        ),
        usage: { inputTokens: 0, usd: 0 },
      }),
  };
  const index = new ExactVectorIndex(provider.config);
  await index.rebuild(corpus, provider, new MemoryEmbeddingCache());
  vi.spyOn(corpus, "search").mockReturnValue(
    ["A", "M", "Z"].map((name, n) => ({
      path: `${name}.md`,
      sectionId: corpus.get(`${name}.md`)!.sections[0]!.id,
      score: 3 - n,
      matchedTerms: ["term"],
    })),
  );
  const reader = new LocalHybridSearch(index, provider);
  expect((await reader.search(corpus, "term")).hits[0]!.path).toBe("Z.md");
});
