import { describe, expect, it } from "vitest";

import { extractLinks, parseFrontmatter, parseNote, sectionSubtree } from "./markdown";

const NOTE = `---
type: Permanent
tags: [zettelkasten, "atomicity"]
aliases:
  - 原子性原则
  - Atomicity
source: "[[Lit - How to Take Smart Notes]]"
---
# 一张卡片只承载一个想法

A note should hold one idea. #method

## 论证

Because links then mean something.

### 反例

\`\`\`python
# this is a comment, not a heading
x = "[[Not A Link]]"
\`\`\`

## C#

Symbols stay in headings.

## 关联

- 支持 [[写作前先画论证图|论证图]]：因为……
- 见 [notes](Other%20Note.md) 和 \`[[code link]]\`
`;

describe("parseNote", () => {
  const note = parseNote("02-Zettelkasten/Permanent/一张卡片只承载一个想法.md", NOTE);

  it("reads frontmatter fields and inline tags", () => {
    expect(note.title).toBe("一张卡片只承载一个想法");
    expect(note.type).toBe("permanent");
    expect(note.aliases).toEqual(["原子性原则", "Atomicity"]);
    expect(note.tags).toEqual(["zettelkasten", "atomicity", "method"]);
  });

  it("retains source and other scalar/list properties without adding them to body sections", () => {
    const parsed = parseNote(
      "Literature/Reading.md",
      '---\nsource_title: "How to Take Smart Notes"\nauthor: "Sönke Ahrens"\nyear: "2017"\nsource: "Book.pdf"\ncustom: [first, second]\n---\n# Reading\n\nA faithful paraphrase.',
    );
    expect(parsed.properties).toEqual({
      source_title: "How to Take Smart Notes",
      author: "Sönke Ahrens",
      year: "2017",
      source: "Book.pdf",
      custom: ["first", "second"],
    });
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0]?.text).not.toContain("source_title");
    expect(parseNote("Plain.md", "No metadata").properties).toEqual({});
  });

  it("splits sections by heading and ignores headings inside code fences", () => {
    expect(note.sections.map((s) => s.headingPath.join(" > "))).toEqual([
      "一张卡片只承载一个想法",
      "一张卡片只承载一个想法 > 论证",
      "一张卡片只承载一个想法 > 论证 > 反例",
      "一张卡片只承载一个想法 > C#",
      "一张卡片只承载一个想法 > 关联",
    ]);
  });

  it("records line ranges that map back into the file", () => {
    const lines = NOTE.split("\n");
    const section = note.sections[1]!;
    expect(lines[section.startLine]).toBe("## 论证");
    expect(section.endLine).toBe(note.sections[2]!.startLine);
  });

  it("collects links from the body and frontmatter, but not from code", () => {
    expect(note.links).toEqual(
      expect.arrayContaining(["Lit - How to Take Smart Notes", "写作前先画论证图", "Other Note"]),
    );
    expect(note.links).not.toContain("Not A Link");
    expect(note.links).not.toContain("code link");
  });

  it("keeps section ids stable when unrelated text changes", () => {
    const edited = parseNote(note.path, NOTE.replace("Symbols stay", "Symbols remain"));
    expect(edited.sections.map((s) => s.id)).toEqual(note.sections.map((s) => s.id));
    expect(edited.contentHash).not.toBe(note.contentHash);
  });

  it("expands a section to include its sub-sections only", () => {
    const argument = note.sections[1]!;
    expect(sectionSubtree(note, argument.id).map((s) => s.headingPath.at(-1))).toEqual([
      "论证",
      "反例",
    ]);
  });
});

describe("parseNote edge cases", () => {
  it("uses the file name as title when there is no frontmatter or H1", () => {
    const note = parseNote("Fleeting/quick idea.md", "just a thought about [[BM25]]");
    expect(note.title).toBe("quick idea");
    expect(note.sections).toHaveLength(1);
    expect(note.sections[0]!.level).toBe(0);
    expect(note.links).toEqual(["BM25"]);
  });

  it("splits oversized sections at blank lines", () => {
    const paragraph = "字".repeat(900);
    const note = parseNote("a.md", `# T\n\n${paragraph}\n\n${paragraph}\n\n${paragraph}\n`);
    expect(note.sections.length).toBeGreaterThan(1);
    expect(new Set(note.sections.map((s) => s.id)).size).toBe(note.sections.length);
  });
});

describe("parseFrontmatter", () => {
  it("decodes quoted metadata and keeps a block-list alias containing commas intact", () => {
    const title = 'Writing, Learning and "Thinking"';
    const author = "A: B";
    const parsed = parseFrontmatter([
      "---",
      "aliases:",
      `  - ${JSON.stringify(title)}`,
      `author: ${JSON.stringify(author)}`,
      "---",
    ]);
    expect(parsed.data.aliases).toEqual([title]);
    expect(parsed.data.author).toBe(author);
  });

  it("returns no data when the closing fence is missing", () => {
    expect(parseFrontmatter(["---", "type: x", "# Title"])).toEqual({ data: {}, bodyStart: 0 });
  });
});

describe("extractLinks", () => {
  it("strips headings, block refs and aliases from wikilink targets", () => {
    expect(extractLinks("[[A#Heading|alias]] ![[B^block]] [[C]]")).toEqual(["A", "B", "C"]);
  });
});
