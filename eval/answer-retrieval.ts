import type { AnswerItem } from "./agent-runner";

export interface SupportPoint {
  id: string;
  /** Alternative sufficient sets of note paths; every note in one set is needed. */
  sets: string[][];
}

/** Key points with note support; absent-fact points (no support sets) are left out. */
export function supportPoints(item: AnswerItem): SupportPoint[] {
  return item.keyPoints
    .filter((point) => point.supportSets.length > 0)
    .map((point) => ({
      id: point.id,
      sets: point.supportSets.map((set) => [
        ...new Set(
          set.map((key) => {
            const evidence = item.evidence[key];
            if (!evidence) throw new Error(`${item.id}/${point.id}: unknown evidence ${key}`);
            return evidence.path;
          }),
        ),
      ]),
    }));
}
