import { describe, expect, it } from "vitest";

import { LexicalIndex } from "./lexical-index";
import { parseNote } from "./markdown";

function indexOf(notes: Record<string, string>) {
  const index = new LexicalIndex();
  for (const [path, content] of Object.entries(notes)) index.upsert(parseNote(path, content));
  return index;
}

const NOTES = {
  "Permanent/双塔召回需要LogQ校正.md": `---
aliases: [LogQ correction]
tags: [recsys]
---
# 双塔召回需要LogQ校正

In-batch 负采样会过度惩罚热门物品，需要用 LogQ 校正采样偏差。

## 关联

- 见 [[Swing 适合 i2i 召回]]`,
  "Permanent/Swing 适合 i2i 召回.md": `# Swing 适合 i2i 召回

Swing 利用共同点击的用户对，比 ItemCF 更抗热门噪声。`,
  "Permanent/Retrieval practice beats rereading.md": `# Retrieval practice beats rereading

Testing yourself produces more durable memory than rereading notes.

## Why

Effortful recall strengthens retrieval routes; rereading creates an illusion of fluency.`,
  "Fleeting/信息论随记.md": `信息熵衡量不确定性。`,
};

describe("LexicalIndex", () => {
  const index = indexOf(NOTES);

  it("finds a Chinese domain term that the segmenter splits", () => {
    expect(index.search("双塔")[0]?.path).toBe("Permanent/双塔召回需要LogQ校正.md");
  });

  it("matches aliases and English terms in a Chinese note", () => {
    expect(index.search("logq correction")[0]?.path).toBe("Permanent/双塔召回需要LogQ校正.md");
  });

  it("matches a single-character query", () => {
    expect(index.search("熵")[0]?.path).toBe("Fleeting/信息论随记.md");
  });

  it("returns the best-matching section and the matched terms", () => {
    const [hit] = index.search("illusion of fluency");
    expect(hit?.path).toBe("Permanent/Retrieval practice beats rereading.md");
    expect(hit?.matchedTerms).toEqual(["illusion", "fluency"]);
    const note = parseNote(hit!.path, NOTES["Permanent/Retrieval practice beats rereading.md"]);
    expect(note.sections.find((s) => s.id === hit!.sectionId)?.headingPath.at(-1)).toBe("Why");
  });

  it("ranks a title match above a passing mention", () => {
    const paths = index.search("Swing").map((hit) => hit.path);
    expect(paths[0]).toBe("Permanent/Swing 适合 i2i 召回.md");
    expect(paths).toContain("Permanent/双塔召回需要LogQ校正.md");
  });

  it("returns one hit per note by default", () => {
    const hits = index.search("retrieval rereading");
    expect(new Set(hits.map((hit) => hit.path)).size).toBe(hits.length);
  });

  it("applies path filters before ranking", () => {
    const hits = index.search("召回", { filter: (path) => path.startsWith("Fleeting/") });
    expect(hits).toEqual([]);
  });

  it("returns nothing for stopword-only or unknown queries", () => {
    expect(index.search("the of 的")).toEqual([]);
    expect(index.search("quantum chromodynamics")).toEqual([]);
  });

  it("updates and removes notes incrementally", () => {
    const local = indexOf(NOTES);
    local.upsert(parseNote("Fleeting/信息论随记.md", "热力学第二定律"));
    expect(local.search("熵")).toEqual([]);
    expect(local.search("热力学")[0]?.path).toBe("Fleeting/信息论随记.md");
    local.remove("Fleeting/信息论随记.md");
    expect(local.search("热力学")).toEqual([]);
  });

  it("is deterministic across rebuilds", () => {
    expect(indexOf(NOTES).search("召回 recall")).toEqual(index.search("召回 recall"));
  });
});
