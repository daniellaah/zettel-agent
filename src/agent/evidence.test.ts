import { describe, expect, it } from "vitest";

import { EvidenceLedger, citationsToLinks, citedIds } from "./evidence";

function ledger() {
  const entries = new EvidenceLedger();
  entries.register({
    path: "Z/Permanent/原子性.md",
    sectionId: "a",
    headingPath: ["原子性", "论证"],
    contentHash: "h1",
  });
  entries.register({
    path: "Z/Lit/Book.md",
    sectionId: "b",
    headingPath: ["Book"],
    contentHash: "h2",
  });
  return entries;
}

describe("EvidenceLedger", () => {
  it("numbers new evidence and reuses ids for the same section and content", () => {
    const entries = ledger();
    const again = entries.register({
      path: "Z/Permanent/原子性.md",
      sectionId: "a",
      headingPath: ["原子性", "论证"],
      contentHash: "h1",
    });
    expect(again).toMatchObject({ isNew: false, evidence: { id: "E1" } });
    const changed = entries.register({
      path: "Z/Permanent/原子性.md",
      sectionId: "a",
      headingPath: ["原子性", "论证"],
      contentHash: "h3",
    });
    expect(changed).toMatchObject({ isNew: true, evidence: { id: "E3" } });
    expect(entries.get("e1")?.path).toBe("Z/Permanent/原子性.md");
  });
});

describe("citedIds", () => {
  it("parses single and grouped citations with Chinese separators", () => {
    expect(citedIds("见 [E2]，以及 [E1, E3]、[E4、E2]。[E] [x]")).toEqual(["E2", "E1", "E3", "E4"]);
  });
});

describe("citationsToLinks", () => {
  it("rewrites citations as note links and keeps unknown ids", () => {
    expect(citationsToLinks("A [E1]. B [E1, E2]. C [E9].", ledger())).toBe(
      "A [[原子性#论证]]. B [[原子性#论证]] [[Book]]. C [E9].",
    );
  });
});
