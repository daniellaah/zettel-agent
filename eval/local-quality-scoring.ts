import {
  evaluateReviewedPool,
  experimentBinding,
  type ExperimentRanking,
  type ReviewedPool,
  HYBRID_PROTOCOL,
} from "./vector-experiment";
import {
  validateLocalReview,
  type ReviewDocument,
  type localReviewSchema,
} from "./local-pool-review";
import type { z } from "zod";
import { percentile } from "./vector-benchmark";

export interface ReviewRow {
  id: string;
  query: string;
  reviewer: "Codex-source-review" | "local-gemma2-initial-review";
  documents: ReviewDocument[];
  judgments: z.infer<typeof localReviewSchema>["judgments"];
}
export interface Adjudication {
  queryId: string;
  path: string;
  grade: 0 | 1 | 2;
  rationale: string;
  quote: string;
}
export interface QualityVariant {
  id: string;
  weights: number[];
  rankings: ExperimentRanking[];
}

/** All candidates must be reviewed; positive overrides must also quote the actual body. */
export function assembleReviewedLabels(
  rows: readonly ReviewRow[],
  overrides: readonly Adjudication[],
) {
  const judgments: Record<string, Record<string, 0 | 1 | 2>> = {};
  const details: Record<
    string,
    Record<string, { grade: 0 | 1 | 2; rationale: string; quote: string; reviewer: string }>
  > = {};
  const unused = new Set(overrides.map((_, index) => index));
  if (new Set(rows.map((row) => row.id)).size !== rows.length)
    throw new Error("Duplicate query review");
  for (const row of rows) {
    validateLocalReview({ judgments: row.judgments }, row.documents);
    judgments[row.id] = {};
    details[row.id] = {};
    for (const doc of row.documents) {
      const initial = row.judgments.find((judgment) => judgment.id === doc.id)!;
      const matches = overrides
        .map((override, index) => ({ override, index }))
        .filter(({ override }) => override.queryId === row.id && override.path === doc.path);
      if (matches.length > 1) throw new Error("Duplicate adjudication");
      const chosen = matches[0]?.override ?? initial;
      if (matches[0]) unused.delete(matches[0].index);
      validateLocalReview(
        {
          judgments: [
            { id: doc.id, grade: chosen.grade, rationale: chosen.rationale, quote: chosen.quote },
          ],
        },
        [doc],
      );
      if (/\buncertain\b/i.test(chosen.rationale))
        throw new Error("Uncertain candidate requires adjudication before freezing");
      judgments[row.id]![doc.path] = chosen.grade;
      details[row.id]![doc.path] = {
        grade: chosen.grade,
        rationale: chosen.rationale,
        quote: chosen.quote,
        reviewer: matches.length ? "Codex-source-adjudication" : row.reviewer,
      };
    }
  }
  if (unused.size) throw new Error("Adjudication outside reviewed pool");
  return { judgments, details };
}

/** Development selection is explicit; a failed gate keeps the current baseline. */
export function summarizeQualityVariants(
  variants: readonly QualityVariant[],
  pool: ReviewedPool,
  revision: string,
  protocolVersion: string,
) {
  if (!variants.length || new Set(variants.map((variant) => variant.id)).size !== variants.length)
    throw new Error("Unique quality variants required");
  const rows = variants.map((variant) => {
    if (experimentBinding(variant.rankings) !== pool.queryBinding)
      throw new Error("Variant query identity mismatch");
    return {
      id: variant.id,
      weights: variant.weights,
      scanP95Ms: percentile(
        variant.rankings.map((row) => row.latencyMs.dense),
        0.95,
      ),
      evaluation: evaluateReviewedPool(variant.rankings, pool, revision, true, protocolVersion),
    };
  });
  const passing = rows
    .filter(
      (row) =>
        row.evaluation.retrievalGate &&
        row.scanP95Ms !== null &&
        row.scanP95Ms < HYBRID_PROTOCOL.scanP95TargetMs,
    )
    .sort(
      (a, b) =>
        (b.evaluation.hybrid.recall10 ?? -1) - (a.evaluation.hybrid.recall10 ?? -1) ||
        (b.evaluation.hybrid.mrr10 ?? -1) - (a.evaluation.hybrid.mrr10 ?? -1) ||
        (a.id === "baseline" ? -1 : b.id === "baseline" ? 1 : a.id.localeCompare(b.id)),
    );
  return {
    rows,
    selected: passing[0]?.id ?? "baseline",
    gatePassed: passing.length > 0,
    decision: passing.length
      ? "Passing development retrieval variant; final checkpoint and paid answer evaluation still required."
      : "No development retrieval variant passes; preserve experimental baseline and BM25 default.",
  };
}
