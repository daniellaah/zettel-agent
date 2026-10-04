import { describe, expect, it } from "vitest";

import { parseNote } from "../retrieval/markdown";
import { resolveSettings } from "../settings";
import { noteDate, planNote } from "./note-template";

const settings = resolveSettings({ zettelkastenRoot: "02-Zettelkasten" });
const date = new Date(2026, 9, 1, 23, 59);

describe("noteDate", () => {
  it("uses the local calendar day and pads month and day", () => {
    expect(noteDate(date)).toBe("2026-10-01");
    expect(noteDate(new Date(2026, 0, 2))).toBe("2026-01-02");
  });
});

describe("planNote", () => {
  it("keeps fleeting capture minimal and puts it in the configured stage folder", () => {
    const plan = planNote({ kind: "fleeting", title: "  一个想法.md  " }, settings, date);
    expect(plan.path).toBe("02-Zettelkasten/Fleeting/一个想法.md");
    expect(plan.content).toBe(
      "---\ntype: fleeting\ncreated: 2026-10-01\ntags: [inbox]\n---\n\n# 一个想法\n\n",
    );
    expect(plan.content.split("\n")[plan.cursorLine]).toBe("");
  });

  it("keeps literature source information in metadata and leaves only a title and blank body", () => {
    const plan = planNote(
      {
        kind: "literature",
        title: "Lit - Ahrens - Smart Notes",
        sourceTitle: "How to Take Smart Notes",
        author: "Sönke Ahrens",
        year: "2017",
        source: "[[Books/Smart Notes.pdf]]",
      },
      settings,
      date,
    );
    const parsed = parseNote(plan.path, plan.content);
    expect(parsed.type).toBe("literature");
    expect(parsed.properties.source_title).toBe("How to Take Smart Notes");
    expect(parsed.properties.year).toBe("2017");
    expect(parsed.links).toContain("Books/Smart Notes.pdf");
    const body = plan.content.split("---\n")[2]!;
    expect(body).toBe("\n# Lit - Ahrens - Smart Notes\n\n");
    expect(plan.content).not.toContain("locator");
    expect(parsed.sections).toHaveLength(1);
    expect(plan.content.split("\n")[plan.cursorLine]).toBe("");
    expect(plan.content.split("\n")[plan.cursorLine - 2]).toBe("# Lit - Ahrens - Smart Notes");
  });

  it("quotes user metadata so YAML punctuation does not turn it into new fields", () => {
    const plan = planNote(
      { kind: "literature", title: "Source", sourceTitle: 'Text: "an idea"', author: "A: B" },
      settings,
      date,
    );
    expect(parseNote(plan.path, plan.content).properties.source_title).toBe('Text: "an idea"');
    expect(plan.content).toContain('author: "A: B"');
  });

  it("keeps permanent sources in a metadata list and leaves a plain writing body", () => {
    const plan = planNote(
      {
        kind: "permanent",
        title: "A note must stand on its own",
        sourceNote: "[[Lit - Ahrens#Reading notes]]",
      },
      settings,
      date,
    );
    const parsed = parseNote(plan.path, plan.content);
    expect(parsed.links).toContain("Lit - Ahrens");
    expect(parsed.properties).toEqual({
      type: "permanent",
      created: "2026-10-01",
      source: ["[[Lit - Ahrens#Reading notes]]"],
    });
    expect(plan.content.split("---\n")[2]).toBe("\n# A note must stand on its own\n\n");
    expect(parsed.sections).toHaveLength(1);
    expect(plan.content.split("\n")[plan.cursorLine]).toBe("");
  });

  it("does not require a source or force a link for a new permanent idea", () => {
    const plan = planNote({ kind: "permanent", title: "New claim" }, settings, date);
    expect(parseNote(plan.path, plan.content).links).toEqual([]);
    expect(parseNote(plan.path, plan.content).properties.source).toEqual([]);
    expect(plan.content).toContain("source: []");
    expect(plan.content.split("---\n")[2]).toBe("\n# New claim\n\n");
  });

  it("supports an empty root and custom or empty stage folders", () => {
    const custom = resolveSettings({
      stageFolders: { literature: "References/Reading", fleeting: "" },
    });
    expect(planNote({ kind: "literature", title: "Book" }, custom, date).path).toBe(
      "References/Reading/Book.md",
    );
    expect(planNote({ kind: "fleeting", title: "Idea" }, custom, date).path).toBe("Idea.md");
  });

  it.each(["", "..", "../escape", "a/b", "a\\b", "a#b", "a^b", "[[note]]", "a:b", "a\nb", "name."])(
    "rejects an unsafe title %j rather than silently changing it",
    (title) => {
      expect(() => planNote({ kind: "fleeting", title }, settings, date)).toThrow(/title/i);
    },
  );

  it.each(["../Outside", "Z/../Outside", "Z//F", ".obsidian", "Z/.trash", "Z\\F", "Z/ F"])(
    "rejects an unsafe destination %j before any write",
    (root) => {
      expect(() =>
        planNote(
          { kind: "fleeting", title: "Idea" },
          { ...settings, zettelkastenRoot: root },
          date,
        ),
      ).toThrow(/folders/i);
    },
  );
});
