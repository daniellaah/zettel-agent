import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Corpus } from "../src/retrieval/corpus";
import { hash } from "../src/retrieval/markdown";
import { decodeVectors, type VectorFile } from "../src/retrieval/vector-file";
import { loadEvaluationData, SUITES } from "./fixture-vault";
import { loadRewrites, rewriteFile } from "./rewrites";

/**
 * Frozen embeddings of the fixture corpus and every evaluation query, one file per model,
 * made by `npm run eval:embed` and committed, so retrieval evaluation stays offline and
 * reproducible.
 */
export const VECTORS_DIR = path.join(import.meta.dirname, "embeddings");

export interface EvalVectors extends VectorFile {
  model: string;
  file: string;
}

export function vectorFilePath(model: string): string {
  return path.join(VECTORS_DIR, `${model.replace(/[^a-z0-9.-]+/gi, "-")}.zav`);
}

/** Section vectors are stored under the dense index's text key, queries under their text. */
export const documentKey = (key: string) => `d:${key}`;
export const queryKey = (query: string) => `q:${hash(query)}`;

/** Every query any retrieval suite asks, and every frozen rewrite of one, once. */
export function evaluationQueries(): string[] {
  const queries = SUITES.flatMap((suite) =>
    loadEvaluationData(suite).retrieval.items.map((item) => item.query),
  );
  // Reference rewrites are suite queries already; model rewrites are frozen files.
  const rewrites = (["llm", "llama3"] as const)
    .filter((source) => existsSync(rewriteFile(source)))
    .flatMap((source) => [...loadRewrites(source).values()]);
  return [...new Set([...queries, ...rewrites])];
}

export function loadEvalVectors(): EvalVectors[] {
  if (!existsSync(VECTORS_DIR)) return [];
  return readdirSync(VECTORS_DIR)
    .filter((name) => name.endsWith(".zav"))
    .sort()
    .map((name) => {
      const file = path.join(VECTORS_DIR, name);
      const decoded = decodeVectors(readFileSync(file));
      const model = decoded.meta?.model;
      if (typeof model !== "string") throw new Error(`${name} does not name its model.`);
      return { ...decoded, model, file };
    });
}

/** Gives a semantic corpus its frozen section vectors; a stale file fails loudly. */
export function applyDocumentVectors(corpus: Corpus, set: EvalVectors): void {
  const dense = corpus.dense;
  if (!dense) throw new Error("The corpus was not created with semantic search.");
  const missing = dense.pending().filter(({ key }) => {
    const vector = set.vectors.get(documentKey(key));
    if (vector) dense.set(key, vector);
    return !vector;
  });
  if (missing.length) throw new Error(stale(set, `${missing.length} section vectors`));
}

export function queryVector(set: EvalVectors, query: string): Float32Array {
  const vector = set.vectors.get(queryKey(query));
  if (!vector) throw new Error(stale(set, `the query ${JSON.stringify(query)}`));
  return vector;
}

function stale(set: EvalVectors, what: string): string {
  return `${path.basename(set.file)} lacks ${what}. Run: EVAL_EMBED_MODEL=${set.model} npm run eval:embed`;
}
