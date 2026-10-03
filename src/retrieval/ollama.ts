import { z } from "zod";
import type { EmbeddingConfig, EmbeddingProvider, EmbeddingResponse } from "./vector";

export const OLLAMA_MODEL = "qwen3-embedding:0.6b";
export const QUERY_INSTRUCTION =
  "Instruct: Given a question, retrieve relevant passages from research notes that answer the question\nQuery: ";
const tagsSchema = z.object({
  models: z.array(z.object({ name: z.string(), digest: z.string().regex(/^[a-f0-9]{64}$/) })),
});
const responseSchema = z.object({
  embeddings: z.array(z.array(z.number().finite())),
  prompt_eval_count: z.number().int().nonnegative().optional(),
});

/** Local-only service. Paths, credentials, remote hosts and redirects are never accepted. */
export function localOllamaUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error(
      "Ollama address must be an HTTP loopback origin, such as http://127.0.0.1:11434",
    );
  return url.origin;
}

/** Identity includes the installed model digest and query representation, not a mutable tag alone. */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly mode = "live" as const;
  readonly config: EmbeddingConfig;
  private constructor(
    private readonly endpoint: string,
    private readonly digest: string,
    private readonly fetcher: typeof fetch,
  ) {
    this.config = {
      provider: "ollama-local",
      model: OLLAMA_MODEL,
      modelVersion: `${digest}:research-query-v1`,
      dimensions: 1024,
      normalization: "l2",
      metric: "cosine",
      batchSize: 8,
      timeoutMs: 120_000,
    };
  }
  static async connect(
    endpoint: string,
    fetcher: typeof fetch = globalThis.fetch,
    signal?: AbortSignal,
  ): Promise<OllamaEmbeddingProvider> {
    const origin = localOllamaUrl(endpoint);
    const digest = await installedDigest(origin, fetcher, signal);
    return new OllamaEmbeddingProvider(origin, digest, fetcher);
  }
  async assertIdentity(signal?: AbortSignal): Promise<void> {
    if ((await installedDigest(this.endpoint, this.fetcher, signal)) !== this.digest)
      throw new Error("Local embedding model changed; rebuild the semantic index");
  }
  async embed(texts: readonly string[], signal: AbortSignal): Promise<EmbeddingResponse> {
    await this.assertIdentity(signal);
    const response = await this.fetcher(`${this.endpoint}/api/embed`, {
      method: "POST",
      signal,
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        input: texts,
        truncate: false,
        keep_alive: "5m",
        options: { num_ctx: 32768 },
      }),
    });
    if (!response.ok)
      throw new Error(
        `Local embedding request failed (${response.status}); check Ollama and input length`,
      );
    const data = responseSchema.parse(await response.json());
    return {
      vectors: data.embeddings,
      usage: { inputTokens: data.prompt_eval_count ?? null, usd: 0 },
    };
  }
}
async function installedDigest(
  endpoint: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetcher(`${endpoint}/api/tags`, {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
      : AbortSignal.timeout(5000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Cannot inspect local Ollama models (${response.status})`);
  const model = tagsSchema
    .parse(await response.json())
    .models.find((item) => item.name === OLLAMA_MODEL);
  if (!model) throw new Error(`Install the local model first: ollama pull ${OLLAMA_MODEL}`);
  return model.digest;
}
