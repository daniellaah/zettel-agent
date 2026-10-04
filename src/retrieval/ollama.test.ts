import { describe, expect, it } from "vitest";

import type { FetchLike } from "../agent/provider";
import { OllamaEmbedder, OllamaError } from "./ollama";

const TAGS = {
  models: [
    { name: "qwen3-embedding:0.6b", digest: "ac6da0dfba84a81f0000" },
    { name: "bge-m3:latest", digest: "790764642607aaaa" },
  ],
};

const urlOf = (input: string | URL | Request) =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

/** Answers /api/tags and /api/embed like Ollama, with vectors of the right count. */
function fakeOllama(requests: { url: string; body: unknown }[] = []): FetchLike {
  return (input, init) => {
    const url = urlOf(input);
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : null;
    requests.push({ url, body });
    if (url.endsWith("/api/tags")) return Promise.resolve(Response.json(TAGS));
    const { input: texts } = body as { input: string[] };
    return Promise.resolve(Response.json({ embeddings: texts.map(() => [3, 4]) }));
  };
}

describe("OllamaEmbedder", () => {
  it("pins the model digest and query format in its id", async () => {
    const qwen = await OllamaEmbedder.connect({ fetch: fakeOllama() });
    const bge = await OllamaEmbedder.connect({ model: "bge-m3", fetch: fakeOllama() });
    expect(qwen.id).toMatch(/^ollama:qwen3-embedding:0\.6b@ac6da0dfba84:q[0-9a-f]+$/);
    expect(bge.id).toMatch(/^ollama:bge-m3@790764642607:q/);
    expect(qwen.id.split(":q")[1]).not.toBe(bge.id.split(":q")[1]);
  });

  it("adds the instruction to Qwen3 queries only, batches, and normalizes", async () => {
    const requests: { url: string; body: unknown }[] = [];
    const embedder = await OllamaEmbedder.connect({
      fetch: fakeOllama(requests),
      baseUrl: "http://127.0.0.1:11434/",
      batchSize: 2,
    });
    const vectors = await embedder.embed(["a", "b", "c"], "document");
    expect(vectors).toEqual([0, 1, 2].map(() => Float32Array.from([0.6, 0.8])));
    const embeds = requests.filter((r) => r.url === "http://127.0.0.1:11434/api/embed");
    expect(embeds.map((r) => (r.body as { input: string[] }).input)).toEqual([["a", "b"], ["c"]]);

    await embedder.embed(["什么是 BM25"], "query");
    const query = (requests.at(-1)!.body as { input: string[] }).input[0]!;
    expect(query).toMatch(/^Instruct: .+\nQuery:什么是 BM25$/);

    const bge = await OllamaEmbedder.connect({ model: "bge-m3", fetch: fakeOllama(requests) });
    await bge.embed(["什么是 BM25"], "query");
    expect((requests.at(-1)!.body as { input: string[] }).input).toEqual(["什么是 BM25"]);
  });

  it("explains a missing model, a stopped server and a server error", async () => {
    await expect(
      OllamaEmbedder.connect({ model: "nomic-embed-text", fetch: fakeOllama() }),
    ).rejects.toThrow("Run: ollama pull nomic-embed-text");
    const refused: FetchLike = () => Promise.reject(new TypeError("fetch failed"));
    await expect(OllamaEmbedder.connect({ fetch: refused })).rejects.toThrow(
      "Cannot reach Ollama at http://localhost:11434",
    );
    const failing: FetchLike = (input) =>
      urlOf(input).endsWith("/api/tags")
        ? Promise.resolve(Response.json(TAGS))
        : Promise.resolve(Response.json({ error: "model crashed" }, { status: 500 }));
    const embedder = await OllamaEmbedder.connect({ fetch: failing });
    const error = await embedder.embed(["x"], "document").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OllamaError);
    expect((error as Error).message).toBe("Ollama (HTTP 500): model crashed");
  });

  it("passes an abort through instead of reporting a stopped server", async () => {
    const controller = new AbortController();
    const aborting: FetchLike = (input, init) =>
      urlOf(input).endsWith("/api/tags")
        ? Promise.resolve(Response.json(TAGS))
        : Promise.reject(init?.signal?.reason as Error);
    const embedder = await OllamaEmbedder.connect({ fetch: aborting });
    controller.abort(new DOMException("stopped", "AbortError"));
    await expect(embedder.embed(["x"], "document", controller.signal)).rejects.toThrow("stopped");
  });
});
