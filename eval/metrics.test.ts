import { describe, expect, it } from "vitest";
import { meanMeasured, scoreRetrieval } from "./metrics";

describe("graded note retrieval metrics", () => {
  it("uses graded gain and grade-2 reciprocal rank", () => {
    const scores = scoreRetrieval(["context", "irrelevant", "answer"], {
      context: 1,
      answer: 2,
      irrelevant: 0,
    });
    expect(scores.recall5).toBe(1);
    expect(scores.mrr).toBeCloseTo(1 / 3);
    expect(scores.ndcg10).toBeCloseTo((1 + 2 / Math.log2(4)) / (2 + 1 / Math.log2(3)));
    expect(scores.unjudged10).toBe(0);
  });
  it("distinguishes missing a sufficient note from having no sufficient note", () => {
    expect(scoreRetrieval(["context"], { context: 1, answer: 2 })).toMatchObject({
      recall10: 0.5,
      mrr: 0,
    });
    expect(scoreRetrieval(["context"], { context: 1 }).mrr).toBeNull();
  });
  it("does not score no-answer retrieval as success or failure", () => {
    expect(scoreRetrieval(["lure", "unknown"], { lure: 0 })).toEqual({
      recall5: null,
      recall10: null,
      mrr: null,
      ndcg10: null,
      unjudged10: 1,
    });
  });
  it("deduplicates notes and respects recall cutoffs", () => {
    const ranked = ["answer", "answer", "x1", "x2", "x3", "x4", "context"];
    expect(scoreRetrieval(ranked, { answer: 2, context: 1 })).toMatchObject({
      recall5: 0.5,
      recall10: 1,
      mrr: 1,
      unjudged10: 4,
    });
  });
  it("returns zero recall for empty rankings and excludes missing measurements from means", () => {
    expect(scoreRetrieval([], { answer: 2 })).toMatchObject({
      recall5: 0,
      recall10: 0,
      ndcg10: 0,
      mrr: 0,
    });
    expect(meanMeasured([null, 0, 1])).toBe(0.5);
    expect(meanMeasured([null])).toBeNull();
    expect(meanMeasured([])).toBeNull();
  });
  it("does not count a sufficient note outside the first ten toward MRR@10", () => {
    expect(
      scoreRetrieval([...Array.from({ length: 10 }, (_, i) => `x${i}`), "answer"], { answer: 2 })
        .mrr,
    ).toBe(0);
  });
  it("counts unjudged notes in the top ten", () => {
    const ranked = [...Array.from({ length: 10 }, (_, i) => `unjudged${i}`), "answer"];
    expect(scoreRetrieval(ranked, { answer: 2 })).toMatchObject({ mrr: 0, unjudged10: 10 });
  });
});
