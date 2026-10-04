import { describe, expect, it } from "vitest";
import type { AnswerItem } from "./agent-runner";
import { supportPoints } from "./answer-retrieval";

const item = {
  id: "t1",
  split: "dev",
  evidence: {
    comparison: { path: "P/comparison.md", basis: "permanent-inference", excerpt: "x" },
    optimizer: { path: "L/optimizer.md", basis: "literature-paraphrase", excerpt: "x" },
    cache: { path: "L/cache.md", basis: "literature-paraphrase", excerpt: "x" },
    cacheAgain: { path: "L/cache.md", basis: "literature-paraphrase", excerpt: "y" },
  },
  keyPoints: [
    { id: "k1", text: "x", supportSets: [["comparison"], ["optimizer", "cache"]] },
    { id: "k2", text: "x", supportSets: [["cache", "cacheAgain"]] },
    { id: "k3", text: "absent owner measurement", supportSets: [] },
  ],
} as unknown as AnswerItem;

describe("answer-task support retrieval", () => {
  it("maps support sets to distinct note paths and drops absent-fact points", () => {
    expect(supportPoints(item)).toEqual([
      { id: "k1", sets: [["P/comparison.md"], ["L/optimizer.md", "L/cache.md"]] },
      { id: "k2", sets: [["L/cache.md"]] },
    ]);
  });
  it("rejects support that names unknown evidence", () => {
    const broken = { ...item, keyPoints: [{ id: "k", text: "x", supportSets: [["missing"]] }] };
    expect(() => supportPoints(broken)).toThrow("t1/k: unknown evidence missing");
  });
});
