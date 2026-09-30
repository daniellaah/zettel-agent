import { describe, expect, it } from "vitest";

import { matchNotes, mentionAt, removeMention, type NoteOption } from "./mentions";

const notes: NoteOption[] = [
  { path: "Z/Permanent/双塔模型把召回变成最近邻搜索.md", title: "双塔模型把召回变成最近邻搜索", stage: "permanent" },
  { path: "Z/Permanent/Swing 相似度惩罚热门共同用户.md", title: "Swing 相似度惩罚热门共同用户", stage: "permanent" },
  { path: "Z/Literature/Lit - Swing Alibaba 2020.md", title: "Lit - Swing Alibaba 2020", stage: "literature" },
  { path: "Z/Fleeting/swing 想法.md", title: "swing 想法", stage: "fleeting" },
]; // prettier-ignore

describe("mentionAt", () => {
  it("finds an @ at the start or after whitespace, with spaces in the query", () => {
    expect(mentionAt("@Swi", 4)).toEqual({ start: 0, query: "Swi" });
    expect(mentionAt("看看 @Swing 相似", 12)).toEqual({ start: 3, query: "Swing 相似" });
  });

  it("ignores emails, other lines and a caret before the @", () => {
    expect(mentionAt("me@example.com", 14)).toBeNull();
    expect(mentionAt("@note\nmore", 10)).toBeNull();
    expect(mentionAt("hi @x", 2)).toBeNull();
  });
});

describe("matchNotes", () => {
  it("ranks title prefixes first, then shorter titles, case-insensitively", () => {
    expect(matchNotes(notes, "swing").map((n) => n.title)).toEqual([
      "swing 想法",
      "Swing 相似度惩罚热门共同用户",
      "Lit - Swing Alibaba 2020",
    ]);
  });

  it("matches Chinese substrings and limits results", () => {
    expect(matchNotes(notes, "召回").map((n) => n.title)).toEqual(["双塔模型把召回变成最近邻搜索"]);
    expect(matchNotes(notes, "", 2)).toHaveLength(2);
  });
});

describe("removeMention", () => {
  it("cuts the @query out and puts the caret where it started", () => {
    expect(removeMention("看看 @Swi 的内容", { start: 3, query: "Swi" }, 7)).toEqual({
      draft: "看看  的内容",
      caret: 3,
    });
  });
});
