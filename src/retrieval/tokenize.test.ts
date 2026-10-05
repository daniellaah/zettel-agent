import { describe, expect, it } from "vitest";

import { tokenize } from "./tokenize";

describe("tokenize", () => {
  it("lower-cases Latin words and drops stopwords", () => {
    expect(tokenize("The Tower model and LogQ")).toEqual(["tower", "model", "logq"]);
  });

  it("uses dictionary words for CJK", () => {
    expect(tokenize("一张卡片只承载一个想法")).toEqual(
      expect.arrayContaining(["一张", "卡片", "只", "承载", "想法"]),
    );
  });

  it("adds bigrams for domain terms the segmenter splits", () => {
    const tokens = tokenize("双塔模型的负采样");
    expect(tokens).toContain("双塔");
    expect(tokens).toContain("采样");
    // "模型" is already a segmenter word, so its bigram is not emitted twice.
    expect(tokens.filter((token) => token === "模型")).toHaveLength(1);
  });

  it("keeps single-character CJK words such as 熵", () => {
    expect(tokenize("信息熵")).toContain("熵");
  });

  it("handles mixed Chinese and English text", () => {
    const tokens = tokenize("召回率recall@10提升");
    expect(tokens).toEqual(expect.arrayContaining(["召回", "recall", "10", "提升"]));
  });

  it("normalizes full-width characters", () => {
    expect(tokenize("ＢＭ２５")).toEqual(["bm25"]);
  });

  it("also emits punctuated compounds whole", () => {
    expect(tokenize("policy-ratio at 8:1:1, recall@10")).toEqual([
      "policy",
      "ratio",
      "8",
      "1",
      "1",
      "recall",
      "10",
      "policy-ratio",
      "8:1:1",
      "recall@10",
    ]);
  });
});
