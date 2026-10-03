import type { EmbeddingConfig, EmbeddingProvider } from "../src/retrieval/vector";
import { hash } from "../src/retrieval/markdown";

/** Pseudorandom test vectors carry no semantic quality claim and make no model calls. */
export class FakeBenchmarkEmbeddings implements EmbeddingProvider {
  readonly mode = "offline";
  constructor(readonly config: EmbeddingConfig) {}
  embed(texts: readonly string[], signal: AbortSignal) {
    signal.throwIfAborted();
    return Promise.resolve({
      vectors: texts.map((text) => {
        let seed = Number.parseInt(hash(text).slice(-8), 16) || 1;
        return Array.from({ length: this.config.dimensions }, () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return seed / 0xffffffff - 0.5;
        });
      }),
      usage: { inputTokens: null, usd: 0 },
    });
  }
}
export function percentile(values: readonly number[], fraction: number): number | null {
  if (
    fraction < 0 ||
    fraction > 1 ||
    !Number.isFinite(fraction) ||
    values.some((value) => !Number.isFinite(value))
  )
    throw new Error("Invalid percentile input");
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)]!;
}
