import { unitVector, type Embedder, type EmbeddingKind } from "../retrieval/embedding";
import { hash } from "../retrieval/markdown";

/**
 * A deterministic stand-in for an embedding model: each word adds weight to one dimension,
 * and `synonyms` map different words (or languages) onto one meaning, as a real model
 * would. Every call is recorded.
 */
export class FakeEmbedder implements Embedder {
  readonly id = "fake";
  readonly calls: { texts: string[]; kind: EmbeddingKind }[] = [];

  constructor(
    private readonly synonyms: Record<string, string> = {},
    private readonly dimensions = 64,
  ) {}

  embed(texts: string[], kind: EmbeddingKind): Promise<Float32Array[]> {
    this.calls.push({ texts, kind });
    return Promise.resolve(texts.map((text) => this.vector(text)));
  }

  vector(text: string): Float32Array {
    const values = new Float32Array(this.dimensions);
    values[0] = 1e-3; // never a zero vector
    for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
      const meaning = this.synonyms[word] ?? word;
      values[1 + (parseInt(hash(meaning).slice(-8), 16) % (this.dimensions - 1))]! += 1;
    }
    return unitVector(values);
  }
}
