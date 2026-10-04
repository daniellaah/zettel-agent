import type { ParsedNote, Section } from "./markdown";

/** Some models embed a search query differently from the text it should find. */
export type EmbeddingKind = "query" | "document";

/**
 * Turns text into unit-length vectors whose dot product measures similarity of meaning,
 * regardless of wording or language.
 */
export interface Embedder {
  /**
   * The vector space: model, exact weights and query formatting. Vectors made under
   * different ids are never compared or reused.
   */
  readonly id: string;
  embed(texts: string[], kind: EmbeddingKind, signal?: AbortSignal): Promise<Float32Array[]>;
}

/**
 * The text a section's vector represents. The note title and heading path give a short
 * section its context; the section's own heading line is not repeated.
 */
export function sectionEmbeddingText(note: ParsedNote, section: Section): string {
  const context = [...new Set([note.title, ...section.headingPath])].join(" › ");
  const body =
    section.level > 0 && !section.continuation
      ? section.text.split("\n").slice(1).join("\n")
      : section.text;
  return `${context}\n\n${body.trim()}`;
}

export function unitVector(values: ArrayLike<number>): Float32Array {
  const vector = Float32Array.from(values);
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm === 0 || !Number.isFinite(norm)) throw new Error("Cannot normalize a zero vector.");
  for (let i = 0; i < vector.length; i++) vector[i]! /= norm;
  return vector;
}

/** Cosine similarity for unit vectors. */
export function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}
