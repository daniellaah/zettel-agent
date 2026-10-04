import { expect, it } from "vitest";

import { Corpus } from "../retrieval/corpus";
import { citationIssues } from "./citation-check";
import { EvidenceLedger } from "./evidence";
import type { ChatMessage } from "./messages";
import { executeTool } from "./tools";

function fixture() {
  const corpus = new Corpus({ stageForPath: () => "permanent" });
  corpus.upsert("a.md", "# Claim\n\nA bounded statement about the source.");
  const outcome = executeTool("read", { target: "a.md" }, { corpus, ledger: new EvidenceLedger() });
  const messages: ChatMessage[] = [
    { role: "user", parts: [{ type: "tool_result", callId: "c", ...outcome }] },
  ];
  return { corpus, messages };
}

it("accepts citations of delivered, unchanged text", () => {
  const { corpus, messages } = fixture();
  expect(citationIssues("A bounded statement [E1].", messages, corpus)).toEqual([]);
});

it("flags ids that were never delivered", () => {
  const { corpus, messages } = fixture();
  expect(citationIssues("Missing [E99].", messages, corpus)).toEqual([
    { code: "undelivered-citation", id: "E99" },
  ]);
});

it("flags notes that changed or disappeared since they were delivered", () => {
  const { corpus, messages } = fixture();
  corpus.upsert("a.md", "# Claim\n\nEdited.");
  expect(citationIssues("Claim [E1].", messages, corpus)).toEqual([
    { code: "stale-evidence", id: "E1" },
  ]);
  corpus.remove("a.md");
  expect(citationIssues("Claim [E1].", messages, corpus)[0]?.code).toBe("stale-evidence");
});
