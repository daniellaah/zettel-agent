import type { Fusion } from "./corpus";
import { RRF_K } from "./fusion";

/**
 * The model the plugin suggests. In the retrieval evaluation it gave the best hybrid
 * results, ran fastest once loaded and used the least memory; its download is larger.
 */
export const DEFAULT_EMBEDDING_MODEL = "bge-m3";

export interface ModelProfile {
  model: RegExp;
  /** The query format the model was trained with; documents are always plain text. */
  formatQuery?: (query: string) => string;
  /** Keyword weight for convex fusion, chosen on the dev split by `npm run eval:sweep`. */
  alpha?: number;
}

const PROFILES: ModelProfile[] = [
  { model: /^bge-m3\b/i, alpha: 0.4 },
  {
    // Qwen3-Embedding expects a one-line task instruction before each query. Without it,
    // Chinese questions about English notes lose recall.
    model: /^qwen3-embedding\b/i,
    formatQuery: (query) =>
      `Instruct: Given a question, retrieve notes from a personal knowledge base that answer it\nQuery:${query}`,
    alpha: 0.6,
  },
];

export function modelProfile(model: string): ModelProfile | undefined {
  return PROFILES.find((profile) => profile.model.test(model));
}

/** Measured models fuse by convex combination with their tuned weight; others by RRF. */
export function fusionFor(model: string): Fusion {
  const alpha = modelProfile(model)?.alpha;
  return alpha === undefined ? { method: "rrf", k: RRF_K } : { method: "convex", alpha };
}
