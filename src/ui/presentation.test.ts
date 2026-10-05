import { describe, expect, it } from "vitest";

import type { AssistantPart } from "../session/chat-session";
import {
  answerNotices,
  citationWarnings,
  researchActivity,
  relativeTime,
  researchPresentation,
  seenPresentation,
  setupMessage,
  sourcesSummary,
  type ChatConfiguration,
} from "./presentation";
import type { SourceView } from "../session/provenance";

const ready: ChatConfiguration = {
  model: "deepseek-flash",
  provider: "DeepSeek",
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
  it("distinguishes loading from an empty scope", () => {
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
  it("treats only the text after the last thinking as the answer", () => {
    const parts: AssistantPart[] = [
      { kind: "text", text: "Let me check." },
      { kind: "thinking", text: "Compare sources" },
      { kind: "text", text: "Answer." },
    ];
    expect(researchPresentation(parts)).toMatchObject({
      research: parts.slice(0, 2),
      answer: parts.slice(2),
    });
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
  it("says nothing when there are no issues", () => {
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

describe("answer notices", () => {
  const done = {
    stop: "answered" as const,
    error: null,
    parts: [],
    citations: { valid: [], unknown: [] },
  };
  it("shows nothing under a clean answer", () => {
    expect(answerNotices(done)).toEqual([]);
  });
  it("shows a failed turn's error, and a later error such as a failed save as a warning", () => {
    expect(answerNotices({ ...done, stop: "error", error: "No key" })).toEqual([
      { tone: "error", text: "No key" },
    ]);
    expect(answerNotices({ ...done, error: "This chat could not be saved." })).toEqual([
      { tone: "warning", text: "This chat could not be saved." },
    ]);
  });
  it("explains stops, omitted turns and citation problems", () => {
    const notices = answerNotices({
      ...done,
      stop: "budget_exhausted",
      context: { omittedTurns: 2, estimatedTokens: 1, staleEvidence: [], fits: true },
      citationIssues: [{ code: "stale-evidence", id: "E1" }],
    });
    expect(notices.map((notice) => notice.tone)).toEqual(["info", "info", "warning"]);
    expect(notices[0]!.text).toMatch(/budget/);
  });
});

describe("source presentation", () => {
  const source = (seen: SourceView["seen"], whole = true, attached = false) => ({
    id: "E1",
    path: `Z/${seen}.md`,
    title: "t",
    heading: null,
    seen,
    whole,
    attached,
  });

  it("names how much of each source the model saw, with read text first", () => {
    expect(seenPresentation(source("body"))).toMatchObject({ label: "Read", tier: "read" });
    expect(seenPresentation(source("body", false))).toMatchObject({
      label: "Read in part",
      tier: "read",
    });
    expect(seenPresentation(source("body", true, true))).toMatchObject({
      label: "Attached",
      tier: "read",
    });
    expect(seenPresentation(source("excerpt"))).toMatchObject({
      label: "Excerpt",
      tier: "partial",
    });
    expect(seenPresentation(source("title"))).toMatchObject({
      label: "Title only",
      tier: "glimpse",
    });
    expect(seenPresentation(source("graph")).tier).toBe("glimpse");
    expect(seenPresentation(source(null))).toMatchObject({ label: "Retrieved", tier: "unknown" });
    for (const seen of ["body", "excerpt", "title", null] as const)
      expect(seenPresentation(source(seen)).description).not.toMatch(/verif|support|correct/i);
  });

  it("summarizes cited notes and counts notes not read in full once each", () => {
    const provenance = (cited: ReturnType<typeof source>[], notes: number) => ({
      cited,
      consulted: [],
      notes,
    });
    expect(sourcesSummary(provenance([], 0))).toEqual({ label: "No notes cited", unread: 0 });
    expect(sourcesSummary(provenance([source("body")], 1))).toEqual({
      label: "1 note cited",
      unread: 0,
    });
    const excerpt = source("excerpt");
    expect(
      sourcesSummary(
        provenance(
          [source("body"), excerpt, { ...excerpt, id: "E2" }, source("title"), source(null)],
          4,
        ),
      ),
    ).toEqual({ label: "4 notes cited", unread: 2 });
  });
});

describe("relativeTime", () => {
  it("describes times relative to now", () => {
    const now = new Date("2026-09-30T12:00:00Z");
    expect(relativeTime("2026-09-30T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-09-30T11:15:00Z", now)).toBe("45 min ago");
    expect(relativeTime("2026-09-30T07:00:00Z", now)).toBe("5 h ago");
    expect(relativeTime("2026-09-29T10:00:00Z", now)).toBe("yesterday");
    expect(relativeTime("2026-09-20T10:00:00Z", now)).toBe("2026-09-20");
  });
});
