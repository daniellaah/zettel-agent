import { describe, expect, it } from "vitest";

import { tokenize } from "./tokenize";

describe("tokenize", () => {
  it("lower-cases Latin words and drops stopwords", () => {
    expect(tokenize("The Two-Tower model and LogQ", "words")).toEqual([
      "two",
      "tower",
      "model",
      "logq",
    ]);
  });

  it("uses dictionary words for CJK in words mode", () => {
    expect(tokenize("一张卡片只承载一个想法", "words")).toEqual([
      "一张",
      "卡片",
      "只",
      "承载",
      "想法",
    ]);
  });

  it("adds bigrams for domain terms the segmenter splits", () => {
    const tokens = tokenize("双塔模型的负采样", "both");
    expect(tokens).toContain("双塔");
    expect(tokens).toContain("采样");
    // "模型" is already a segmenter word, so its bigram is not emitted twice.
    expect(tokens.filter((token) => token === "模型")).toHaveLength(1);
  });

  it("keeps single-character CJK words such as 熵", () => {
    expect(tokenize("信息熵", "both")).toContain("熵");
    expect(tokenize("熵", "bigrams")).toEqual(["熵"]);
  });

  it("handles mixed Chinese and English text", () => {
    const tokens = tokenize("召回率recall@10提升", "both");
    expect(tokens).toEqual(expect.arrayContaining(["召回", "recall", "10", "提升"]));
  });

  it("normalizes full-width characters", () => {
    expect(tokenize("ＢＭ２５", "words")).toEqual(["bm25"]);
  });

  it("can also emit punctuated compounds whole", () => {
    expect(tokenize("policy-ratio at 8:1:1, recall@10", "both", { compounds: true })).toEqual([
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
    expect(tokenize("policy-ratio")).toEqual(["policy", "ratio"]);
  });
});
