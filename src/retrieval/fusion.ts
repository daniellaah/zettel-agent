export interface RankedSection {
  path: string;
  sectionId: string;
}

export interface FusedSection extends RankedSection {
  score: number;
  /** 1-based rank in each input list, or null where that list did not return the section. */
  ranks: (number | null)[];
}

/** The constant from Cormack et al. (2009); larger values flatten the gap between ranks. */
export const RRF_K = 60;

/**
 * Reciprocal rank fusion: each list adds 1 / (k + rank) for every section it returns.
 * Only ranks are used, because raw scores (BM25 sums, cosine similarities) are not
 * comparable across retrievers.
 */
export function reciprocalRankFusion(lists: RankedSection[][], k = RRF_K): FusedSection[] {
  const fused = new Map<string, FusedSection>();
  lists.forEach((list, listIndex) => {
    list.forEach(({ path, sectionId }, i) => {
      const id = `${path}\u0000${sectionId}`;
      let entry = fused.get(id);
      if (!entry) {
        entry = { path, sectionId, score: 0, ranks: lists.map(() => null) };
        fused.set(id, entry);
      }
      if (entry.ranks[listIndex] !== null) return;
      entry.ranks[listIndex] = i + 1;
      entry.score += 1 / (k + i + 1);
    });
  });
  const best = (entry: FusedSection) =>
    Math.min(...entry.ranks.map((rank) => rank ?? Number.POSITIVE_INFINITY));
  // Deterministic order: score, then best single rank, then path and section.
  return [...fused.values()].sort(
    (a, b) =>
      b.score - a.score ||
      best(a) - best(b) ||
      a.path.localeCompare(b.path) ||
      a.sectionId.localeCompare(b.sectionId),
  );
}
