import { expect, it, vi } from "vitest";
import { localOllamaUrl, OllamaEmbeddingProvider, OLLAMA_MODEL } from "./ollama";
import { encode } from "./vector";

it("accepts only explicit HTTP loopback origins", () => {
  expect(localOllamaUrl("http://localhost:11434/")).toBe("http://localhost:11434");
  expect(localOllamaUrl("http://[::1]:11434")).toBe("http://[::1]:11434");
  for (const url of [
    "https://localhost",
    "http://host.example",
    "http://127.0.0.1/a",
    "http://u:p@localhost",
    "http://localhost/?x=1",
    "http://localhost/#x",
  ])
    expect(() => localOllamaUrl(url)).toThrow("loopback");
});
it("pins the installed digest, disables truncation, reports local token usage and validates vectors", async () => {
  let digest = "a".repeat(64);
  const fetcher = vi.fn<typeof fetch>((input) =>
    Promise.resolve(
      new Response(
        JSON.stringify(
          (typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url
          ).endsWith("tags")
            ? { models: [{ name: OLLAMA_MODEL, digest }] }
            : { embeddings: [[3, 4, ...Array<number>(1022).fill(0)]], prompt_eval_count: 12 },
        ),
      ),
    ),
  );
  const provider = await OllamaEmbeddingProvider.connect("http://127.0.0.1:11434", fetcher);
  const result = await encode(provider, ["正文"]);
  expect(result.vectors[0]!.slice(0, 2)).toEqual([0.6, 0.8]);
  expect(result.usage).toEqual({ inputTokens: 12, usd: 0 });
  const request = fetcher.mock.calls.find(([url]) =>
    (typeof url === "string" ? url : url instanceof URL ? url.href : url.url).endsWith("embed"),
  )![1]!;
  expect(JSON.parse(request.body as string)).toMatchObject({
    model: OLLAMA_MODEL,
    input: ["正文"],
    truncate: false,
  });
  expect(request.redirect).toBe("error");
  digest = "b".repeat(64);
  await expect(provider.assertIdentity()).rejects.toThrow("changed");
  await expect(encode(provider, ["text"])).rejects.toThrow("changed");
});
it("reports missing models and provider failure without falling through to another service", async () => {
  await expect(
    OllamaEmbeddingProvider.connect("http://localhost:11434", () =>
      Promise.resolve(new Response('{"models":[]}')),
    ),
  ).rejects.toThrow("ollama pull");
  await expect(
    OllamaEmbeddingProvider.connect("http://localhost:11434", () =>
      Promise.resolve(new Response("", { status: 503 })),
    ),
  ).rejects.toThrow("503");
  const fetcher: typeof fetch = (input) =>
    Promise.resolve(
      new Response(
        JSON.stringify(
          (typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url
          ).endsWith("tags")
            ? { models: [{ name: OLLAMA_MODEL, digest: "a".repeat(64) }] }
            : { embeddings: [[0]] },
        ),
      ),
    );
  const provider = await OllamaEmbeddingProvider.connect("http://localhost:11434", fetcher);
  await expect(encode(provider, ["too small"])).rejects.toThrow("dimension");
});
