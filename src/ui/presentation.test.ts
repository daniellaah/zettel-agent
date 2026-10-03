import { describe, expect, it } from "vitest";

import type { AssistantPart } from "../session/chat-session";
import {
  citationWarnings,
  researchActivity,
  researchPresentation,
  setupMessage,
  type ChatConfiguration,
} from "./presentation";

const ready: ChatConfiguration = {
  model: "deepseek-flash",
  provider: "DeepSeek",
  mode: "off",
  hasKey: true,
  folder: "Research",
  notes: 318,
  indexed: true,
};

describe("local setup guidance", () => {
  it("prioritizes model and key without claiming an API connection was tested", () => {
    expect(setupMessage(ready)).toBeNull();
    expect(setupMessage({ ...ready, model: " ", hasKey: false })).toMatch(/Choose a model/);
    expect(setupMessage({ ...ready, hasKey: false })).toMatch(/DeepSeek API key/);
  });
  it("does not require a key in offline replay and distinguishes loading from an empty scope", () => {
    expect(setupMessage({ ...ready, mode: "replay", hasKey: false })).toBeNull();
    expect(setupMessage({ ...ready, indexed: false, notes: 0 })).toMatch(/Loading/);
    expect(setupMessage({ ...ready, notes: 0 })).toMatch(/No research notes/);
  });
});

describe("research disclosure", () => {
  const tool: AssistantPart = {
    kind: "tool",
    id: "t1",
    name: "search",
    input: {},
    summary: "search → 3 sections",
    isError: false,
  };
  it("preserves ordered preambles, thinking and tools while exposing the final answer", () => {
    const parts: AssistantPart[] = [
      { kind: "text", text: "I will search." },
      tool,
      { kind: "thinking", text: "Compare sources" },
      { kind: "text", text: "Answer [E1]." },
    ];
    const result = researchPresentation(parts);
    expect(result.research).toEqual(parts.slice(0, 3));
    expect(result.answer).toEqual(parts.slice(3));
    expect(result.steps).toBe(1);
    expect(parts).toHaveLength(4);
  });
  it("keeps text-only responses visible and never fabricates an answer after an interrupted tool", () => {
    expect(researchPresentation([]).answer).toEqual([]);
    expect(researchPresentation([{ kind: "text", text: "Hello" }]).research).toEqual([]);
    expect(researchPresentation([tool]).answer).toEqual([]);
  });
  it("separates a research limit from actual tool failures without hiding either trace", () => {
    const budget = { ...tool, isError: true, summary: "search → output-budget" };
    expect(researchPresentation([budget]).limited).toBe(true);
    expect(researchPresentation([budget]).failed).toBe(false);
    const failed = { ...tool, isError: true, summary: "read → unavailable" };
    expect(researchPresentation([budget, failed])).toMatchObject({
      limited: true,
      failed: true,
      steps: 2,
    });
  });
});

describe("research activity", () => {
  const running: AssistantPart = {
    kind: "tool",
    id: "t1",
    name: "read",
    input: {},
    summary: null,
    isError: false,
  };
  it("names the step in progress and falls back to a general label", () => {
    expect(researchActivity([running])).toBe("Reading a note…");
    expect(researchActivity([{ ...running, name: "unknown" }])).toBe("Researching your notes…");
    expect(researchActivity([{ kind: "thinking", text: "Compare" }])).toBe("Thinking…");
  });
  it("does not describe a finished tool or an empty turn as a step in progress", () => {
    expect(researchActivity([{ ...running, summary: "read → 1 note" }])).toBe(
      "Researching your notes…",
    );
    expect(researchActivity([])).toBe("Researching your notes…");
  });
});

describe("citation warnings", () => {
  it("says nothing about citations when the only issue is an empty or oversized answer", () => {
    expect(citationWarnings([{ code: "review-size" }], [])).toEqual([]);
    expect(citationWarnings([], [])).toEqual([]);
  });
  it("names unknown citations once instead of repeating them as undelivered", () => {
    const warnings = citationWarnings([{ code: "undelivered-citation" }], ["E9", "E12"]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("E9, E12");
  });
  it("reports undelivered and changed sources as separate problems", () => {
    const warnings = citationWarnings(
      [{ code: "undelivered-citation" }, { code: "stale-evidence" }],
      [],
    );
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/no source text/);
    expect(warnings[1]).toMatch(/changed/);
  });
});
