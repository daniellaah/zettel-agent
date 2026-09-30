import { describe, it } from "vitest";

import type { TokenizerMode } from "../src/retrieval/tokenize";
import { loadFixtureCorpus, loadJudgments, type Judgment } from "./fixture-vault";

/**
 * Lexical retrieval quality on the fixture vault's judged queries, per tokenizer mode.
 * Scored at note level (one hit per note), the unit the agent reads and cites.
 */

const MODES: TokenizerMode[] = ["words", "bigrams", "both"];
const K = 10;

interface Scores {
  recall5: number;
  recall10: number;
  mrr: number;
  ndcg10: number;
}

function score(ranked: string[], relevant: string[]): Scores {
  const hitsAt = (k: number) => ranked.slice(0, k).filter((p) => relevant.includes(p)).length;
  const first = ranked.findIndex((p) => relevant.includes(p));
  const dcg = ranked
    .slice(0, K)
    .reduce((sum, p, i) => sum + (relevant.includes(p) ? 1 / Math.log2(i + 2) : 0), 0);
  const ideal = relevant.slice(0, K).reduce((sum, _p, i) => sum + 1 / Math.log2(i + 2), 0);
  return {
    recall5: hitsAt(5) / relevant.length,
    recall10: hitsAt(10) / relevant.length,
    mrr: first === -1 ? 0 : 1 / (first + 1),
    ndcg10: dcg / ideal,
  };
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);
}

const pct = (value: number) => `${(value * 100).toFixed(1)}`.padStart(6);

describe("retrieval", () => {
  it("reports BM25 quality per tokenizer mode", () => {
    const judgments = loadJudgments();
    const answerable = judgments.filter((j) => j.relevant.length > 0);
    const rows: string[] = [];
    const failures = new Map<TokenizerMode, string[]>();

    for (const mode of MODES) {
      const corpus = loadFixtureCorpus(mode);
      const perQuery = answerable.map((j: Judgment) => {
        const ranked = corpus.search(j.query, { limit: K }).map((hit) => hit.path);
        const s = score(ranked, j.relevant);
        if (s.recall10 < 1) {
          const missed = j.relevant
            .filter((p) => !ranked.includes(p))
            .map((p) => p.split("/").pop());
          (failures.get(mode) ?? failures.set(mode, []).get(mode)!).push(
            `${j.id} [${j.kind}/${j.lang}] R@10=${s.recall10.toFixed(2)} missed: ${missed.join("; ")}`,
          );
        }
        return { j, s };
      });
      const agg = (pick: (s: Scores) => number, filter?: (j: Judgment) => boolean) =>
        mean(perQuery.filter(({ j }) => !filter || filter(j)).map(({ s }) => pick(s)));
      rows.push(
        [
          mode.padEnd(8),
          pct(agg((s) => s.recall5)),
          pct(agg((s) => s.recall10)),
          pct(agg((s) => s.mrr)),
          pct(agg((s) => s.ndcg10)),
          pct(
            agg(
              (s) => s.recall10,
              (j) => j.lang === "zh",
            ),
          ),
          pct(
            agg(
              (s) => s.recall10,
              (j) => j.lang === "en",
            ),
          ),
          pct(
            agg(
              (s) => s.recall10,
              (j) => j.lang === "mixed",
            ),
          ),
        ].join(" "),
      );
    }

    const noAnswer = judgments.filter((j) => j.relevant.length === 0);
    const corpus = loadFixtureCorpus("both");
    const noAnswerHits = noAnswer.map(
      (j) => `${j.id} "${j.query}" → ${corpus.search(j.query, { limit: 3 }).length} hits`,
    );

    console.log(
      [
        `\nRetrieval on fixture vault: ${answerable.length} answerable queries, ${noAnswer.length} no-answer, ${corpus.size} notes`,
        "mode        R@5   R@10    MRR nDCG10  R@10zh R@10en R@10mix",
        ...rows,
        "\nMisses (both):",
        ...(failures.get("both") ?? ["(none)"]),
        "\nNo-answer queries (lexical search still returns partial matches; the agent must judge):",
        ...noAnswerHits,
      ].join("\n"),
    );
  });
});
