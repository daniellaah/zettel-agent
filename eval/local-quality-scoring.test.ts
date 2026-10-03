import { expect, it } from "vitest";
import { assembleReviewedLabels, summarizeQualityVariants } from "./local-quality-scoring";
import { experimentBinding, type ExperimentRanking, type ReviewedPool } from "./vector-experiment";
it("freezes only complete, supported, adjudicated labels", () => {
  const row = {
    id: "q",
    query: "what",
    reviewer: "Codex-source-review" as const,
    documents: [{ id: "n", path: "a", text: "Direct source support for this answer." }],
    judgments: [
      {
        id: "n",
        grade: 0 as const,
        rationale: "Uncertain relationship to the question.",
        quote: "",
      },
    ],
  };
  expect(() => assembleReviewedLabels([row], [])).toThrow("Uncertain");
  const override = {
    queryId: "q",
    path: "a",
    grade: 2 as const,
    rationale: "Directly answers the specified question.",
    quote: row.documents[0]!.text,
  };
  expect(assembleReviewedLabels([row], [override]).judgments).toEqual({ q: { a: 2 } });
  expect(() =>
    assembleReviewedLabels([row], [{ ...override, quote: "fabricated passage" }]),
  ).toThrow("exact");
  expect(() => assembleReviewedLabels([row], [override, override])).toThrow("Duplicate");
  expect(() => assembleReviewedLabels([row], [{ ...override, path: "missing" }])).toThrow();
});
it("selects a passing development variant and preserves baseline when none passes", () => {
  const hit = { path: "a", sectionId: "a", contentHash: "a", score: 1 };
  const base: ExperimentRanking = {
    id: "q",
    family: "family",
    slice: "exact-term",
    query: "q",
    filters: {},
    rankings: { lexical: [], dense: [hit], hybrid: [] },
    latencyMs: { queryEmbedding: 0, dense: 0, lexical: 0, hybrid: 0 },
    queryAccounting: { cacheHit: true, requests: 0, inputTokens: 0, usd: 0 },
  };
  const pool: ReviewedPool = {
    version: "new",
    reviewer: "ai",
    frozen: true,
    corpusRevision: "r",
    protocolVersion: "local-v1",
    queryBinding: experimentBinding([base]),
    judgments: { q: { a: 2 } },
  };
  const baseline = { id: "baseline", weights: [1, 1], rankings: [base] };
  expect(summarizeQualityVariants([baseline], pool, "r", "local-v1").selected).toBe("baseline");
  const improved = {
    id: "improved",
    weights: [1, 2],
    rankings: [{ ...base, rankings: { ...base.rankings, hybrid: [hit] } }],
  };
  expect(summarizeQualityVariants([baseline, improved], pool, "r", "local-v1")).toMatchObject({
    selected: "improved",
    gatePassed: true,
  });
  const slow = {
    ...improved,
    rankings: [{ ...improved.rankings[0]!, latencyMs: { ...base.latencyMs, dense: 100 } }],
  };
  expect(summarizeQualityVariants([baseline, slow], pool, "r", "local-v1").gatePassed).toBe(false);
  expect(() => summarizeQualityVariants([baseline, baseline], pool, "r", "local-v1")).toThrow(
    "Unique",
  );
});
