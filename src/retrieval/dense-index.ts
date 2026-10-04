import { dot, sectionEmbeddingText } from "./embedding";
import { hash, type ParsedNote } from "./markdown";

export interface DenseHit {
  path: string;
  sectionId: string;
  /** Cosine similarity: closeness of meaning, not entailment. */
  score: number;
}

/**
 * Section vectors for semantic search, compared one by one rather than through an
 * approximate index: exact, filterable, and fast enough for a personal vault.
 *
 * Vectors are stored by a hash of the text they embed, so an unchanged section keeps its
 * vector through edits elsewhere in the note, renames and rebuilds. Sections without a
 * vector yet are simply absent from semantic results.
 */
export class DenseIndex {
  private readonly notes = new Map<string, { sectionId: string; key: string }[]>();
  private readonly vectors = new Map<string, Float32Array>();
  /** Texts still waiting for a vector, by key. */
  private readonly waiting = new Map<string, string>();
  private dimensions: number | null = null;

  upsert(note: ParsedNote): void {
    const entries = note.sections.map((section) => {
      const text = sectionEmbeddingText(note, section);
      const key = hash(text);
      if (!this.vectors.has(key)) this.waiting.set(key, text);
      return { sectionId: section.id, key };
    });
    this.notes.set(note.path, entries);
  }

  remove(path: string): void {
    this.notes.delete(path);
  }

  /** Distinct texts that current sections need embedded. */
  pending(): { key: string; text: string }[] {
    const needed = new Set(this.keys());
    for (const key of this.waiting.keys()) if (!needed.has(key)) this.waiting.delete(key);
    return [...this.waiting].map(([key, text]) => ({ key, text }));
  }

  set(key: string, vector: Float32Array): void {
    this.dimensions ??= vector.length;
    if (vector.length !== this.dimensions)
      throw new Error(`Expected ${this.dimensions} dimensions, got ${vector.length}.`);
    this.vectors.set(key, vector);
    this.waiting.delete(key);
  }

  get(key: string): Float32Array | undefined {
    return this.vectors.get(key);
  }

  /** Sections that have a vector, out of all sections. */
  coverage(): { embedded: number; total: number } {
    let embedded = 0;
    let total = 0;
    for (const key of this.keys()) {
      total++;
      if (this.vectors.has(key)) embedded++;
    }
    return { embedded, total };
  }

  /** Stored vectors that current sections use, e.g. for saving a cache. */
  usedVectors(): Map<string, Float32Array> {
    const used = new Map<string, Float32Array>();
    for (const key of this.keys()) {
      const vector = this.vectors.get(key);
      if (vector) used.set(key, vector);
    }
    return used;
  }

  search(
    query: Float32Array,
    options: { limit?: number; filter?: (path: string) => boolean } = {},
  ): DenseHit[] {
    const { limit = 10, filter } = options;
    if (this.dimensions !== null && query.length !== this.dimensions)
      throw new Error(`Query has ${query.length} dimensions; the index has ${this.dimensions}.`);
    const hits: (DenseHit & { order: number })[] = [];
    for (const [path, entries] of this.notes) {
      if (filter && !filter(path)) continue;
      entries.forEach(({ sectionId, key }, order) => {
        const vector = this.vectors.get(key);
        if (vector) hits.push({ path, sectionId, score: dot(query, vector), order });
      });
    }
    // Deterministic order: score, then path, then position in the note.
    return hits
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.order - b.order)
      .slice(0, limit)
      .map(({ path, sectionId, score }) => ({ path, sectionId, score }));
  }

  private *keys(): Iterable<string> {
    for (const entries of this.notes.values()) for (const { key } of entries) yield key;
  }
}
