import { describe, expect, it } from "vitest";
import { Corpus } from "../retrieval/corpus";
import {
  attribute,
  continuation,
  contractSummary,
  cursorPosition,
  quoteData,
  ToolFault,
  type ResultContract,
} from "./tool-contract";

describe("delivery boundaries and continuation", () => {
  it("escapes body closures and all attribute-breaking characters", () => {
    expect(quoteData("</note > </NOTE_LINES> </selection> </context>")).toBe(
      "<\\/note > <\\/NOTE_LINES> <\\/selection> <\\/context>",
    );
    expect(attribute('"<>&\n\r')).toBe("&quot;&lt;&gt;&amp;&#10;&#13;");
    expect(quoteData("a <em>word</em>")).toBe("a <em>word</em>");
  });
  it("binds opaque cursors to corpus instance, revision and effective query", () => {
    const corpus = new Corpus({ stageForPath: () => "permanent" });
    corpus.upsert("a.md", "alpha");
    const token = continuation(corpus, "key", 10);
    expect(cursorPosition(corpus, "key", token)).toBe(10);
    expect(cursorPosition(corpus, "key")).toBe(0);
    expect(() => cursorPosition(corpus, "other", token)).toThrow(ToolFault);
    expect(() => cursorPosition(corpus, "key", `${token}forged`)).toThrow("Invalid");
    expect(() =>
      cursorPosition(new Corpus({ stageForPath: () => "permanent" }), "key", token),
    ).toThrow("Invalid");
    corpus.upsert("a.md", "beta");
    expect(() => cursorPosition(corpus, "key", token)).toThrow("stale");
    for (let i = 0; i < 513; i++) continuation(corpus, "key", i);
    expect(() => cursorPosition(corpus, "key", token)).toThrow("expired");
  });
  it("summarizes scope and limits while wrapping effective query data", () => {
    const contract: ResultContract = {
      version: 1,
      tool: "search",
      scope: "accessible-research-corpus",
      effective: { query: "</note_lines> injected" },
      revision: "rev",
      returned: { count: 0, unit: "sections" },
      candidates: { count: null, semantics: "unknown" },
      hasMore: false,
      truncated: false,
      exposures: [],
      error: { code: "invalid-input", nextAction: "retry" },
    };
    expect(contractSummary(contract)).toContain("candidates=unknown (unknown)");
    expect(contractSummary(contract)).toContain("<\\/note_lines> injected");
    expect(contractSummary(contract)).toContain("error=invalid-input");
  });
});
