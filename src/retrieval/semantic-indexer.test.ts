import { describe, expect, it } from "vitest";

import { FakeEmbedder } from "../testing/fake-embedder";
import { Corpus } from "./corpus";
import type { Embedder } from "./embedding";
import { SemanticIndexer, type SemanticStatus, type VectorStore } from "./semantic-indexer";

class MemoryStore implements VectorStore {
  bytes: Uint8Array | null = null;
  saves = 0;
  load() {
    return Promise.resolve(this.bytes);
  }
  save(bytes: Uint8Array) {
    this.bytes = bytes;
    this.saves++;
    return Promise.resolve();
  }
}

function corpusWith(count: number): Corpus {
  const corpus = new Corpus({ stageForPath: () => "permanent", semantic: true });
  for (let i = 0; i < count; i++)
    corpus.upsert(`P/Note ${i}.md`, `# Note ${i}\n\nScaling statistics belong to fold ${i}.`);
  return corpus;
}

function indexer(
  corpus: () => Corpus,
  store: VectorStore,
  embedder: Embedder = new FakeEmbedder(),
) {
  const statuses: SemanticStatus[] = [];
  const instance = new SemanticIndexer({
    connect: () => Promise.resolve(embedder),
    store,
    corpus,
    fusion: { method: "convex", alpha: 0.4 },
    onStatus: (status) => statuses.push(status),
    batchSize: 2,
    saveDelayMs: 0,
  });
  return { instance, statuses };
}

const documentCalls = (embedder: FakeEmbedder) =>
  embedder.calls.filter((call) => call.kind === "document").flatMap((call) => call.texts);

describe("SemanticIndexer", () => {
  it("embeds the corpus in batches, reports progress and saves the vectors", async () => {
    const corpus = corpusWith(5);
    const store = new MemoryStore();
    const embedder = new FakeEmbedder();
    const { instance, statuses } = indexer(() => corpus, store, embedder);
    await instance.start();
    await instance.idle();
    expect(documentCalls(embedder)).toHaveLength(5);
    expect(statuses.map((s) => s.state)).toEqual(["indexing", "indexing", "indexing", "ready"]);
    expect(instance.status).toEqual({ state: "ready", embedded: 5, total: 5 });
    await instance.stop();
    expect(store.saves).toBeGreaterThan(0);
  });

  it("reuses saved vectors and embeds only what changed", async () => {
    const store = new MemoryStore();
    const first = corpusWith(3);
    const run = indexer(() => first, store);
    await run.instance.start();
    await run.instance.idle();
    await run.instance.stop();

    // A new session over the same notes plus one edit: only the edited section is new.
    const second = corpusWith(3);
    second.upsert("P/Note 1.md", "# Note 1\n\nEdited text.");
    const embedder = new FakeEmbedder();
    const next = indexer(() => second, store, embedder);
    await next.instance.start();
    await next.instance.idle();
    expect(documentCalls(embedder)).toEqual(["Note 1\n\nEdited text."]);
    expect(second.dense!.coverage()).toEqual({ embedded: 3, total: 3 });
  });

  it("fills a rebuilt corpus from vectors it already has", async () => {
    let corpus = corpusWith(3);
    const embedder = new FakeEmbedder();
    const { instance } = indexer(() => corpus, new MemoryStore(), embedder);
    await instance.start();
    await instance.idle();
    corpus = corpusWith(3);
    instance.refresh();
    await instance.idle();
    expect(documentCalls(embedder)).toHaveLength(3);
    expect(corpus.dense!.coverage()).toEqual({ embedded: 3, total: 3 });
  });

  it("replaces vectors left by another embedder", async () => {
    const corpus = corpusWith(2);
    const old = indexer(() => corpus, new MemoryStore(), new FakeEmbedder({}, 64));
    await old.instance.start();
    await old.instance.idle();
    await old.instance.stop();
    const next = indexer(() => corpus, new MemoryStore(), new FakeEmbedder({}, 32));
    await next.instance.start();
    await next.instance.idle();
    const result = await next.instance.queryVectors(["scaling"]);
    expect(result!.vectors.get("scaling")).toHaveLength(32);
    expect(() =>
      corpus.search("scaling", {
        hybrid: { queryVector: result!.vectors.get("scaling")!, fusion: result!.fusion },
      }),
    ).not.toThrow();
  });

  it("returns query vectors only once enough sections are embedded", async () => {
    const corpus = corpusWith(3);
    const { instance } = indexer(() => corpus, new MemoryStore());
    expect(await instance.queryVectors(["scaling"])).toBeNull();
    await instance.start();
    await instance.idle();
    const result = await instance.queryVectors(["scaling", "folds"]);
    expect([...result!.vectors.keys()]).toEqual(["scaling", "folds"]);
    expect(result!.fusion).toEqual({ method: "convex", alpha: 0.4 });
    corpus.upsert("P/New.md", "# New\n\nNot embedded yet.");
    corpus.upsert("P/Other.md", "# Other\n\nNot embedded either.");
    // 3 of 5 sections embedded is below the readiness threshold.
    expect(await instance.queryVectors(["scaling"])).toBeNull();
  });

  it("explains an unreachable embedder and keeps search on keywords", async () => {
    const corpus = corpusWith(2);
    const { instance, statuses } = indexer(() => corpus, new MemoryStore());
    const failing = new SemanticIndexer({
      connect: () => Promise.reject(new Error("Cannot reach Ollama at http://localhost:11434.")),
      store: new MemoryStore(),
      corpus: () => corpus,
      fusion: { method: "rrf", k: 60 },
      onStatus: (status) => statuses.push(status),
    });
    await failing.start();
    expect(failing.status).toEqual({
      state: "unavailable",
      message: "Cannot reach Ollama at http://localhost:11434.",
    });
    expect(await failing.queryVectors(["scaling"])).toBeNull();
    await instance.stop();
  });

  it("falls back to keywords when embedding a query fails or stalls", async () => {
    const corpus = corpusWith(2);
    const documents = new FakeEmbedder();
    const make = (embedQuery: () => Promise<Float32Array[]>) =>
      new SemanticIndexer({
        connect: () =>
          Promise.resolve({
            id: "flaky",
            embed: (texts: string[], kind: "query" | "document") =>
              kind === "query" ? embedQuery() : documents.embed(texts, kind),
          }),
        store: new MemoryStore(),
        corpus: () => corpus,
        fusion: { method: "rrf", k: 60 },
        queryTimeoutMs: 10,
      });
    const stalled = make(() => new Promise<Float32Array[]>(() => {}));
    await stalled.start();
    await stalled.idle();
    expect(await stalled.queryVectors(["scaling"])).toBeNull();
    const failing = make(() => Promise.reject(new Error("model crashed")));
    await failing.start();
    await failing.idle();
    expect(await failing.queryVectors(["scaling"])).toBeNull();
  });
});
