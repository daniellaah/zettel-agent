import { describe, expect, it } from "vitest";

import {
  relativeTime,
  removeSummary,
  upsertSummary,
  type ConversationSummary,
} from "./conversation-index";

const summary = (id: string, updatedAt: string): ConversationSummary => ({
  id,
  title: id,
  updatedAt,
  questions: 1,
});

describe("conversation index", () => {
  it("keeps summaries unique and newest first", () => {
    let list = upsertSummary([], summary("a", "2026-09-30T10:00:00Z"));
    list = upsertSummary(list, summary("b", "2026-09-30T11:00:00Z"));
    list = upsertSummary(list, summary("a", "2026-09-30T12:00:00Z"));
    expect(list.map((s) => s.id)).toEqual(["a", "b"]);
    expect(removeSummary(list, "a").map((s) => s.id)).toEqual(["b"]);
  });

  it("describes times relative to now", () => {
    const now = new Date("2026-09-30T12:00:00Z");
    expect(relativeTime("2026-09-30T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-09-30T11:15:00Z", now)).toBe("45 min ago");
    expect(relativeTime("2026-09-30T07:00:00Z", now)).toBe("5 h ago");
    expect(relativeTime("2026-09-29T10:00:00Z", now)).toBe("yesterday");
    expect(relativeTime("2026-09-20T10:00:00Z", now)).toBe("2026-09-20");
  });
});
