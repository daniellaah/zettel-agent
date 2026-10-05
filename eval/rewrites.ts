import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { loadEvaluationData } from "./fixture-vault";

/**
 * Each query restated in the other language, so a search can ask in both at once.
 * reference: the expanded and cross-lingual suites restate each other (for a Chinese query
 * the English original is exact). llm and llama3 are frozen model rewrites, made blind to
 * the suites, in eval/suites/rewrites.
 */
export const REWRITE_SOURCES = ["reference", "llm", "llama3"] as const;
export type RewriteSource = (typeof REWRITE_SOURCES)[number];

const rewriteSetSchema = z
  .object({
    schema: z.literal(1),
    source: z.string().min(1),
    method: z.string().min(1),
    items: z.array(z.object({ query: z.string().min(1), rewrite: z.string().min(1) }).strict()),
  })
  .strict();

export function rewriteFile(source: Exclude<RewriteSource, "reference">): string {
  return path.join(import.meta.dirname, "suites/rewrites", `${source}.json`);
}

/** Query text -> its rewrite. Queries without one are absent. */
export function loadRewrites(source: RewriteSource): Map<string, string> {
  if (source === "reference") {
    const english = loadEvaluationData("expanded").retrieval.items;
    const chinese = loadEvaluationData("crosslingual").retrieval.items;
    return new Map(
      english.flatMap((item, i) => [
        [item.query, chinese[i]!.query],
        [chinese[i]!.query, item.query],
      ]),
    );
  }
  const set = rewriteSetSchema.parse(JSON.parse(readFileSync(rewriteFile(source), "utf8")));
  return new Map(set.items.map((item) => [item.query, item.rewrite]));
}
