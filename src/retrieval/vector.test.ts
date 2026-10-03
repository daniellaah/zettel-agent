import { describe, expect, it } from "vitest";
import { Corpus } from "./corpus";
import { parseNote } from "./markdown";
import {
  cosine,
  embeddingInput,
  encode,
  ExactVectorIndex,
  MemoryEmbeddingCache,
  modelIdentity,
  normalizedVector,
  reciprocalRankFusion,
  validateEmbeddingConfig,
  vectorKey,
  type EmbeddingConfig,
  type EmbeddingProvider,
} from "./vector";

const config: EmbeddingConfig = {
  provider: "fake",
  model: "test-neighbors",
  modelVersion: "1",
  dimensions: 3,
  normalization: "l2",
  metric: "cosine",
  batchSize: 2,
  timeoutMs: 1000,
};
function corpus(): Corpus {
  const result = new Corpus({
    stageForPath: (path) => (path.startsWith("F/") ? "fleeting" : "permanent"),
  });
  result.upsert("P/A.md", "---\ntags: [topic/sub]\n---\n# A\nalpha\n## More\nalpha beta");
  result.upsert("P/B.md", "beta");
  result.upsert("P/C.md", "gamma");
  result.upsert("F/Secret.md", "alpha secret");
  return result;
}
function provider(): EmbeddingProvider & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    config,
    mode: "offline",
    calls,
    async embed(texts) {
      await Promise.resolve();
      calls.push([...texts]);
      return {
        vectors: texts.map((text) =>
          text.includes("alpha") ? [1, 0, 0] : text.includes("beta") ? [0, 1, 0] : [0, 0, 1],
        ),
        usage: { inputTokens: 10, usd: 0 },
      };
    },
  };
}

describe("embedding contract", () => {
  it("validates explicit model/dimension configuration and records encoder inputs", () => {
    expect(() => validateEmbeddingConfig({ ...config, model: "" })).toThrow();
    expect(() => validateEmbeddingConfig({ ...config, batchSize: 0 })).toThrow();
    expect(() => validateEmbeddingConfig({ ...config, dimensions: 0 })).toThrow();
    expect(modelIdentity(config)).not.toBe(modelIdentity({ ...config, modelVersion: "2" }));
    const note = parseNote("A.md", "# A\nalpha");
    expect(embeddingInput(note, note.sections[0]!)).toBe("Title: A\nHeading: A\nBody:\n# A\nalpha");
    expect(vectorKey(note, note.sections[0]!, config)).not.toBe(
      vectorKey(note, note.sections[0]!, { ...config, modelVersion: "2" }),
    );
    const edited = parseNote("A.md", "# A\nchanged");
    expect(vectorKey(note, note.sections[0]!, config)).not.toBe(
      vectorKey(edited, edited.sections[0]!, config),
    );
  });
  it("normalizes robustly, computes cosine and rejects invalid vectors", () => {
    expect(normalizedVector([3, 4, 0], 3)).toEqual([0.6, 0.8, 0]);
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(() => cosine([1], [1, 0])).toThrow("dimension");
    expect(() => normalizedVector([0, 0, 0], 3)).toThrow("Zero");
    expect(() => normalizedVector([NaN, 0, 0], 3)).toThrow("Invalid");
    expect(() => normalizedVector([1, 0], 3)).toThrow("dimension");
    expect(normalizedVector([1e308, 1e308], 2)[0]).toBeCloseTo(Math.SQRT1_2);
    expect(normalizedVector([1e-310, 0], 2)).toEqual([1, 0]);
  });
  it("enforces deadline/cancellation even for an adapter that never responds", async () => {
    const stuck: EmbeddingProvider = {
      config: { ...config, timeoutMs: 5 },
      mode: "offline",
      embed: () => new Promise(() => {}),
    };
    await expect(encode(stuck, ["alpha"])).rejects.toThrow("deadline");
    const controller = new AbortController();
    const pending = encode({ ...stuck, config }, ["alpha"], controller.signal);
    controller.abort(new Error("cancelled"));
    await expect(pending).rejects.toThrow("cancelled");
    await expect(encode(provider(), ["x"], controller.signal)).rejects.toThrow("cancelled");
  });
  it("rejects partial batches and malformed accounting", async () => {
    const partial: EmbeddingProvider = {
      ...provider(),
      async embed() {
        await Promise.resolve();
        return { vectors: [], usage: { inputTokens: null, usd: null } };
      },
    };
    await expect(encode(partial, ["x"])).rejects.toThrow("Incomplete");
    await expect(
      encode(
        {
          ...partial,
          async embed() {
            await Promise.resolve();
            return { vectors: [[1, 0, 0]], usage: { inputTokens: -1, usd: 0 } };
          },
        },
        ["x"],
      ),
    ).rejects.toThrow("accounting");
  });
});

describe("exact vectors and incremental caches", () => {
  it("finds exact neighbors, applies filters before caps and keeps fake inputs outside fleeting", async () => {
    const source = corpus();
    const encoder = provider();
    const index = new ExactVectorIndex(config);
    expect(index.status(source)).toBe("unavailable");
    const cache = new MemoryEmbeddingCache();
    const build = await index.rebuild(source, encoder, cache);
    expect(build).toMatchObject({
      expectedSections: 4,
      encodedSections: 4,
      cachedSections: 0,
      requests: 2,
      inputTokens: 20,
      usd: 0,
    });
    expect(index.status(source)).toBe("complete");
    expect(index.vectorBytes).toBe(4 * 3 * 8);
    expect(index.search(source, [1, 0, 0])[0]!.path).toBe("P/A.md");
    expect(
      index.search(source, [1, 0, 0], { tag: "topic", stages: [], perNote: 2, limit: 10 }),
    ).toHaveLength(2);
    expect(index.search(source, [1, 0, 0], { folder: "F" })).toEqual([]);
    expect(encoder.calls.flat().join("\n")).not.toContain("secret");
    const again = await index.rebuild(source, encoder, cache);
    expect(again).toMatchObject({ cachedSections: 4, encodedSections: 0, requests: 0 });
    const snapshot = index.snapshot();
    snapshot[0]!.vector[0] = 123;
    expect(index.snapshot()[0]!.vector[0]).not.toBe(123);
  });
  it("invalidates edited/renamed/deleted/reclassified vectors and removes stale cache entries", async () => {
    const source = corpus();
    const encoder = provider();
    const index = new ExactVectorIndex(config);
    const cache = new MemoryEmbeddingCache();
    await index.rebuild(source, encoder, cache);
    source.upsert("P/A.md", "changed");
    expect(index.status(source)).toBe("stale");
    expect(() => index.search(source, [1, 0, 0])).toThrow("stale");
    const changed = await index.rebuild(source, encoder, cache);
    expect(changed).toMatchObject({ cachedSections: 2, encodedSections: 1 });
    expect(cache.size).toBe(3);
    source.rename("P/B.md", "P/New.md", "beta");
    source.upsert("P/C.md", "---\ntype: fleeting\n---\ngamma");
    source.remove("P/A.md");
    await index.rebuild(source, encoder, cache);
    expect(index.snapshot().map((r) => r.path)).toEqual(["P/New.md"]);
    expect(cache.size).toBe(1);
    const newModel = { ...config, modelVersion: "2" };
    await new ExactVectorIndex(newModel).rebuild(source, { ...encoder, config: newModel }, cache);
    expect(cache.size).toBe(1);
  });
  it("does not publish incomplete/failed indexes, rejects mismatches and offline cache misses", async () => {
    const source = corpus();
    const cache = new MemoryEmbeddingCache();
    const index = new ExactVectorIndex(config);
    await expect(
      index.rebuild(source, { ...provider(), config: { ...config, dimensions: 2 } }, cache),
    ).rejects.toThrow("mismatch");
    const failure: EmbeddingProvider = {
      ...provider(),
      async embed() {
        await Promise.resolve();
        throw new Error("Offline cache miss; no live fallback");
      },
    };
    await expect(index.rebuild(source, failure, cache)).rejects.toThrow("Offline");
    expect(index.status(source)).toBe("unavailable");
    expect(() => index.search(source, [1, 0, 0])).toThrow("unavailable");
    await index.rebuild(source, provider(), cache);
    const bad = index.snapshot()[0]!;
    await cache.put({ ...bad, modelIdentity: "wrong" });
    await expect(index.rebuild(source, provider(), cache)).rejects.toThrow("identity");
    expect(index.size).toBe(0);
  });
  it("aborts publication when corpus changes while encoding", async () => {
    const source = corpus();
    const index = new ExactVectorIndex(config);
    const encoder = provider();
    await expect(
      index.rebuild(
        source,
        {
          ...encoder,
          async embed(texts, signal) {
            source.remove("P/A.md");
            return encoder.embed(texts, signal);
          },
        },
        new MemoryEmbeddingCache(),
      ),
    ).rejects.toThrow("changed");
    expect(index.status(source)).toBe("unavailable");
  });
});

it("fuses section ranks with declared RRF constant and note deduplication", () => {
  const a = { path: "a.md", sectionId: "a", contentHash: "1", score: 999 };
  const b = { path: "b.md", sectionId: "b", contentHash: "1", score: 0.1 };
  const c = { ...a, sectionId: "a2" };
  const hits = reciprocalRankFusion(
    [
      [a, b, c],
      [b, a],
    ],
    10,
    60,
  );
  expect(hits).toHaveLength(2);
  expect(hits[0]!.score).toBeCloseTo(1 / 61 + 1 / 62);
  expect(reciprocalRankFusion([[a, c]], 10, 60, 2)).toHaveLength(2);
  expect(reciprocalRankFusion([[a, a]], 10, 60)[0]!.score).toBeCloseTo(1 / 61);
  expect(() => reciprocalRankFusion([[a], [{ ...a, contentHash: "changed" }]])).toThrow("revision");
  expect(() => reciprocalRankFusion([[a]], 10, 0)).toThrow("settings");
});

it("retains unknown failed-request accounting and prunes reclassified entries during failure", async () => {
  const source = corpus();
  const index = new ExactVectorIndex(config);
  const cache = new MemoryEmbeddingCache();
  await index.rebuild(source, provider(), cache);
  source.upsert("P/A.md", "new version");
  const failure: EmbeddingProvider = {
    ...provider(),
    embed() {
      source.upsert("P/C.md", "---\ntype: fleeting\n---\nprivate");
      return Promise.reject(new Error("unknown usage"));
    },
  };
  await expect(index.rebuild(source, failure, cache)).rejects.toThrow("unknown usage");
  expect(index.lastBuild).toMatchObject({ requests: 1, inputTokens: null, usd: null });
  expect(cache.size).toBe(1);
  expect(index.status(source)).toBe("unavailable");
});

it("weights RRF branches without changing equal-weight defaults or accepting invalid weights", () => {
  const a = { path: "a.md", sectionId: "a", contentHash: "a", score: 1 };
  const b = { path: "b.md", sectionId: "b", contentHash: "b", score: 1 };
  expect(reciprocalRankFusion([[a], [b]], 2, 60, 1, [1, 1])).toEqual(
    reciprocalRankFusion([[a], [b]], 2),
  );
  expect(reciprocalRankFusion([[a], [b]], 2, 60, 1, [1, 2])[0]!.path).toBe("b.md");
  for (const weights of [[1], [1, 0], [1, NaN]])
    expect(() => reciprocalRankFusion([[a], [b]], 2, 60, 1, weights)).toThrow("Invalid");
});
