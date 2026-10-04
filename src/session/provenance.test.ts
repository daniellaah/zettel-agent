import { describe, expect, it } from "vitest";

import { EvidenceLedger, type Evidence } from "../agent/evidence";
import type { ChatMessage } from "../agent/messages";
import type { DeliveredSpan, EvidenceScope, ResultContract } from "../agent/tool-contract";
import { answerProvenance } from "./provenance";

const evidence: Evidence[] = [
  { id: "E1", path: "Z/Alpha.md", sectionId: "s1", headingPath: ["Alpha"], contentHash: "a" },
  {
    id: "E2",
    path: "Z/Beta.md",
    sectionId: "s2",
    headingPath: ["Beta", "Method"],
    contentHash: "b",
  },
  { id: "E3", path: "Z/Gamma.md", sectionId: "s3", headingPath: ["Gamma"], contentHash: "c" },
  {
    id: "E4",
    path: "Z/Beta.md",
    sectionId: "s4",
    headingPath: ["Beta", "Limits"],
    contentHash: "b",
  },
  { id: "E5", path: "Z/Delta.md", sectionId: "s5", headingPath: ["Delta"], contentHash: "d" },
];
const ledger = new EvidenceLedger(evidence);

const span = (id: string, scope: EvidenceScope, wholeSection = true): DeliveredSpan => ({
  ...evidence.find((entry) => entry.id === id)!,
  scope,
  text: "t",
  wholeSection,
});
const contract = (exposures: DeliveredSpan[]): ResultContract => ({
  version: 1,
  tool: "t",
  scope: "accessible-research-corpus",
  effective: {},
  revision: "r",
  returned: { count: exposures.length, unit: "sections" },
  candidates: { count: exposures.length, semantics: "exact" },
  hasMore: false,
  truncated: false,
  exposures,
});
const results = (...exposures: DeliveredSpan[][]): ChatMessage => ({
  role: "user",
  parts: exposures.map((spans, index) => ({
    type: "tool_result",
    callId: `c${index}`,
    content: "result",
    isError: false,
    contract: contract(spans),
  })),
});
const question: ChatMessage = { role: "user", parts: [{ type: "text", text: "q" }] };
const answer: ChatMessage = { role: "assistant", parts: [{ type: "text", text: "a" }] };

describe("answer provenance", () => {
  it("lists cited sources in citation order with the most of each the model saw", () => {
    const history = [
      question,
      results([span("E2", "excerpt"), span("E1", "title")], [span("E2", "body", false)]),
      results([span("E4", "excerpt")]),
      answer,
    ];
    const provenance = answerProvenance({
      history,
      turnStart: 0,
      turnEnd: history.length,
      cited: ["E2", "e1", "E9", "E4", "E2"],
      ledger,
    });
    expect(provenance.cited).toEqual([
      {
        id: "E2",
        path: "Z/Beta.md",
        title: "Beta",
        heading: "Method",
        seen: "body",
        whole: false,
        attached: false,
      },
      {
        id: "E1",
        path: "Z/Alpha.md",
        title: "Alpha",
        heading: null,
        seen: "title",
        whole: false,
        attached: false,
      },
      expect.objectContaining({ id: "E4", heading: "Limits", seen: "excerpt", whole: false }),
    ]);
    expect(provenance.notes).toBe(2);
  });

  it("counts deliveries from earlier turns for citations, but lists only this turn as consulted", () => {
    const history = [
      question,
      results([span("E1", "body"), span("E3", "excerpt")]),
      answer,
      question,
      results([span("E5", "title"), span("E4", "excerpt")], [span("E5", "excerpt")]),
      answer,
    ];
    const provenance = answerProvenance({
      history,
      turnStart: 3,
      turnEnd: 6,
      cited: ["E1", "E2"],
      ledger,
    });
    expect(provenance.cited.map((s) => [s.id, s.seen, s.whole])).toEqual([
      ["E1", "body", true],
      ["E2", null, false],
    ]);
    // E3 belongs to the earlier turn; E4 is another section of the cited note Beta.
    expect(provenance.consulted).toEqual([
      expect.objectContaining({ id: "E5", path: "Z/Delta.md", seen: "excerpt", heading: null }),
    ]);
  });

  it("marks attached notes and treats chats without delivery records as unknown", () => {
    const attached: ChatMessage = {
      role: "user",
      parts: [{ type: "text", text: "q" }],
      deliveries: [contract([span("E3", "body")])],
    };
    const legacy: ChatMessage = {
      role: "user",
      parts: [{ type: "tool_result", callId: "c", content: "old result", isError: false }],
    };
    const history = [attached, legacy, answer];
    const provenance = answerProvenance({
      history,
      turnStart: 0,
      turnEnd: 3,
      cited: ["E3", "E5"],
      ledger,
    });
    expect(provenance.cited.map((s) => [s.id, s.seen, s.whole, s.attached])).toEqual([
      ["E3", "body", true, true],
      ["E5", null, false, false],
    ]);
    expect(provenance.consulted).toEqual([]);
  });
});
