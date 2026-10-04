export interface RetrievalScores {
  recall5: number | null;
  recall10: number | null;
  /** Undefined if no single note is sufficient (no grade-2 judgment). */
  mrr: number | null;
  ndcg10: number | null;
  unjudged10: number;
}

/** Note-level metrics. Unknown candidates count as zero gain, but remain visible. */
export function scoreRetrieval(
  ranked: string[],
  grades: Record<string, 0 | 1 | 2>,
): RetrievalScores {
  const unique = [...new Set(ranked)];
  const relevant = Object.values(grades).filter((grade) => grade > 0);
  const unjudged10 = unique.slice(0, 10).filter((path) => grades[path] === undefined).length;
  if (relevant.length === 0) {
    return { recall5: null, recall10: null, mrr: null, ndcg10: null, unjudged10 };
  }
  const recall = (k: number) =>
    unique.slice(0, k).filter((path) => (grades[path] ?? 0) > 0).length / relevant.length;
  const dcg = unique
    .slice(0, 10)
    .reduce((sum, path, i) => sum + (grades[path] ?? 0) / Math.log2(i + 2), 0);
  const ideal = relevant
    .sort((a, b) => b - a)
    .slice(0, 10)
    .reduce<number>((sum, grade, i) => sum + grade / Math.log2(i + 2), 0);
  const first = unique.slice(0, 10).findIndex((path) => grades[path] === 2);
  return {
    recall5: recall(5),
    recall10: recall(10),
    mrr: relevant.includes(2) ? (first === -1 ? 0 : 1 / (first + 1)) : null,
    ndcg10: dcg / ideal,
    unjudged10,
  };
}

/** Missing measurements are excluded, rather than turned into perfect or failed scores. */
export function meanMeasured(values: (number | null)[]): number | null {
  const measured = values.filter((value): value is number => value !== null);
  return measured.length ? measured.reduce((sum, value) => sum + value, 0) / measured.length : null;
}

/**
 * The same metrics on judged notes only: unjudged notes are dropped before the cutoff
 * ("condensed lists", Sakai 2007). Fairer to a retriever whose finds were never in the
 * labeling pool, at the cost of ignoring those finds entirely.
 */
export function scoreJudgedOnly(
  ranked: string[],
  grades: Record<string, 0 | 1 | 2>,
): RetrievalScores {
  return scoreRetrieval(
    ranked.filter((path) => grades[path] !== undefined),
    grades,
  );
}
