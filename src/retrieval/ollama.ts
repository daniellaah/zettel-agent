import type { FetchLike } from "../agent/provider";
import { unitVector, type Embedder, type EmbeddingKind } from "./embedding";
import { DEFAULT_EMBEDDING_MODEL, modelProfile } from "./embedding-models";
import { hash } from "./markdown";

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";
/** A problem the user can fix: Ollama not running, model not downloaded, or a bad response. */
export class OllamaError extends Error {
  override readonly name = "OllamaError";
}

interface OllamaOptions {
  model?: string;
  baseUrl?: string;
  fetch?: FetchLike;
  /** Texts per request. */
  batchSize?: number;
}

/** Embeddings from an Ollama server, by default the one on this computer. */
export class OllamaEmbedder implements Embedder {
  readonly id: string;
  private readonly formatQuery: (query: string) => string;

  private constructor(
    readonly model: string,
    /** Exact weights: re-pulling a model under the same name can change them. */
    readonly digest: string,
    private readonly baseUrl: string,
    private readonly fetch: FetchLike,
    private readonly batchSize: number,
  ) {
    this.formatQuery = modelProfile(model)?.formatQuery ?? ((q) => q);
    // A changed query instruction changes every query vector, so it is part of the space.
    this.id = `ollama:${model}@${digest.slice(0, 12)}:q${hash(this.formatQuery("{query}"))}`;
  }

  /** Checks that the server runs and has the model, and pins the model's exact weights. */
  static async connect(options: OllamaOptions = {}): Promise<OllamaEmbedder> {
    const model = options.model ?? DEFAULT_EMBEDDING_MODEL;
    const baseUrl = (options.baseUrl ?? DEFAULT_OLLAMA_URL).replace(/\/+$/, "");
    const fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    const { models = [] } = await request<{ models?: { name: string; digest: string }[] }>(
      fetch,
      `${baseUrl}/api/tags`,
    );
    const tagged = model.includes(":") ? model : `${model}:latest`;
    const found = models.find((entry) => entry.name === model || entry.name === tagged);
    if (!found)
      throw new OllamaError(`Model ${model} is not downloaded. Run: ollama pull ${model}`);
    return new OllamaEmbedder(model, found.digest, baseUrl, fetch, options.batchSize ?? 32);
  }

  async embed(texts: string[], kind: EmbeddingKind, signal?: AbortSignal): Promise<Float32Array[]> {
    const inputs = kind === "query" ? texts.map((text) => this.formatQuery(text)) : texts;
    const vectors: Float32Array[] = [];
    for (let i = 0; i < inputs.length; i += this.batchSize) {
      const batch = inputs.slice(i, i + this.batchSize);
      const { embeddings } = await request<{ embeddings?: number[][] }>(
        this.fetch,
        `${this.baseUrl}/api/embed`,
        { model: this.model, input: batch, truncate: true },
        signal,
      );
      if (embeddings?.length !== batch.length)
        throw new OllamaError("Ollama returned the wrong number of embeddings.");
      vectors.push(...embeddings.map((values) => unitVector(values)));
    }
    return vectors;
  }
}

async function request<T>(
  fetch: FetchLike,
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...(body !== undefined && {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      ...(signal && { signal }),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new OllamaError(`Cannot reach Ollama at ${new URL(url).origin}. Is it running?`);
  }
  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error ?? text;
    } catch {
      // Not JSON: keep the raw body.
    }
    throw new OllamaError(`Ollama (HTTP ${response.status}): ${message || response.statusText}`);
  }
  return JSON.parse(text) as T;
}
