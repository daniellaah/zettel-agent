/**
 * Parses a Markdown note into the pieces retrieval needs: frontmatter fields, heading
 * sections (the unit of indexing and citation), outgoing links and tags. Pure and
 * Obsidian-free so the evaluation harness can run it in Node.
 */

export interface Section {
  /** Stable across edits elsewhere in the note: hash of path, heading path and occurrence. */
  id: string;
  /** Headings from the top of the note down to this section, e.g. ["Title", "Links"]. */
  headingPath: string[];
  /** Heading level 1–6, or 0 for text before the first heading. */
  level: number;
  /** 0-based line range [startLine, endLine) in the whole file, frontmatter included. */
  startLine: number;
  endLine: number;
  text: string;
  links: string[];
}

export interface ParsedNote {
  path: string;
  /** File basename without extension; Obsidian resolves [[links]] by it. */
  title: string;
  aliases: string[];
  tags: string[];
  /** Generic scalar/list metadata, retained as untrusted note data. */
  properties: Record<string, string | string[]>;
  /** Frontmatter `type`, used to override the stage derived from the folder. */
  type: string | null;
  links: string[];
  sections: Section[];
  contentHash: string;
}

/** Sections longer than this are split at blank lines so one chunk stays citable. */
const MAX_CHUNK_CHARS = 2000;

const HEADING = /^(#{1,6})[ \t]+(.*)$/;
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;
const WIKILINK = /!?\[\[([^\]|#^]*)(?:[#^][^\]|]*)?(?:\|[^\]]*)?\]\]/g;
const MARKDOWN_LINK = /\[[^\]]*\]\(([^)\s]+?\.md)(?:#[^)]*)?\)/g;
const INLINE_TAG = /(?:^|\s)#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;
const INLINE_CODE = /`[^`\n]*`/g;

export function parseNote(path: string, content: string): ParsedNote {
  const lines = content.split(/\r?\n/);
  const { data, bodyStart } = parseFrontmatter(lines);
  const title = basename(path);

  const sections: Section[] = [];
  const headingStack: { level: number; text: string }[] = [];
  const occurrences = new Map<string, number>();
  const tags = new Set(asList(data.tags).map(stripHash));
  // Obsidian treats [[links]] in frontmatter properties (e.g. `source`) as real links.
  const links = new Set(
    Object.values(data).flatMap((value) => asList(value).flatMap(extractLinks)),
  );

  let current = { level: 0, headingPath: [] as string[], startLine: bodyStart };
  let fence: string | null = null;

  const closeSection = (endLine: number) => {
    const body = lines.slice(current.startLine, endLine);
    if (body.join("").trim() === "") return;
    for (const piece of splitOversized(body, current.startLine)) {
      const key = [path, ...current.headingPath].join("\u0000");
      const occurrence = occurrences.get(key) ?? 0;
      occurrences.set(key, occurrence + 1);
      const sectionLinks = extractLinks(stripFencedCode(piece.text));
      sectionLinks.forEach((link) => links.add(link));
      sections.push({
        id: hash(`${key}\u0000${occurrence}`),
        headingPath: current.headingPath,
        level: current.level,
        startLine: piece.startLine,
        endLine: piece.endLine,
        text: piece.text,
        links: sectionLinks,
      });
    }
  };

  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i]!;
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]!;
      if (fence === null) fence = marker[0]!.repeat(marker.length);
      else if (marker.startsWith(fence)) fence = null;
      continue;
    }
    if (fence !== null) continue;

    for (const tag of line.replace(INLINE_CODE, "").matchAll(INLINE_TAG)) tags.add(tag[1]!);

    const heading = HEADING.exec(line);
    if (!heading) continue;
    closeSection(i);
    const level = heading[1]!.length;
    // Strip an optional closing sequence ("## Title ##"), but keep "## C#".
    const text = heading[2]!.replace(/[ \t]+#+[ \t]*$/, "").trim();
    while (headingStack.length > 0 && headingStack[headingStack.length - 1]!.level >= level) {
      headingStack.pop();
    }
    headingStack.push({ level, text });
    current = { level, headingPath: headingStack.map((h) => h.text), startLine: i };
  }
  closeSection(lines.length);

  return {
    path,
    title,
    aliases: asList(data.aliases),
    tags: [...tags],
    properties: data,
    type: typeof data.type === "string" && data.type !== "" ? data.type.toLowerCase() : null,
    links: [...links],
    sections,
    contentHash: hash(content),
  };
}

/** Lines [start, end) of the section at `startLine` together with all its sub-sections. */
export function sectionSubtree(note: ParsedNote, sectionId: string): Section[] {
  const index = note.sections.findIndex((section) => section.id === sectionId);
  if (index === -1) return [];
  const root = note.sections[index]!;
  const subtree = [root];
  for (const section of note.sections.slice(index + 1)) {
    const sharesPrefix = root.headingPath.every((heading, i) => section.headingPath[i] === heading);
    // Pieces of an oversized section share its heading path and level.
    const isContinuation =
      section.level === root.level && section.headingPath.length === root.headingPath.length;
    const isDescendant = root.level > 0 && section.level > root.level;
    if (!sharesPrefix || !(isContinuation || isDescendant)) break;
    subtree.push(section);
  }
  return subtree;
}

type FrontmatterValue = string | string[];

/** Parses the YAML subset used in note frontmatter: scalars, inline lists and block lists. */
export function parseFrontmatter(lines: string[]): {
  data: Record<string, FrontmatterValue>;
  bodyStart: number;
} {
  const data: Record<string, FrontmatterValue> = {};
  if (lines[0]?.trim() !== "---") return { data, bodyStart: 0 };
  const end = lines.findIndex((line, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(line));
  if (end === -1) return { data, bodyStart: 0 };

  let listKey: string | null = null;
  for (const line of lines.slice(1, end)) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && listKey !== null) {
      const list = data[listKey];
      if (Array.isArray(list)) list.push(unquote(item[1]!));
      continue;
    }
    const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!pair) continue;
    const key = pair[1]!;
    const value = pair[2]!.trim();
    if (value === "") {
      data[key] = [];
      listKey = key;
    } else if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = value
        .slice(1, -1)
        .split(",")
        .map((part) => unquote(part.trim()))
        .filter((part) => part !== "");
      listKey = null;
    } else {
      data[key] = unquote(value);
      listKey = null;
    }
  }
  return { data, bodyStart: end + 1 };
}

export function extractLinks(text: string): string[] {
  const targets = new Set<string>();
  const withoutCode = text.replace(INLINE_CODE, "");
  for (const match of withoutCode.matchAll(WIKILINK)) {
    const target = match[1]!.trim();
    if (target !== "") targets.add(target);
  }
  for (const match of withoutCode.matchAll(MARKDOWN_LINK)) {
    targets.add(decodeURIComponent(match[1]!).replace(/\.md$/, ""));
  }
  return [...targets];
}

/** 53-bit string hash (cyrb53) as hex: stable, synchronous, fine for identity, not security. */
export function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** Packs blank-line-separated blocks into pieces of at most MAX_CHUNK_CHARS where possible. */
function splitOversized(
  body: string[],
  startLine: number,
): { text: string; startLine: number; endLine: number }[] {
  const blocks: { from: number; to: number; size: number }[] = [];
  let from = 0;
  for (let i = 0; i <= body.length; i++) {
    if (i === body.length || body[i]!.trim() === "") {
      if (i > from) {
        const size = body.slice(from, i + 1).reduce((sum, line) => sum + line.length + 1, 0);
        blocks.push({ from, to: Math.min(i + 1, body.length), size });
      }
      from = i + 1;
    }
  }

  const pieces: { text: string; startLine: number; endLine: number }[] = [];
  let pieceFrom = 0;
  let pieceSize = 0;
  for (const block of blocks) {
    if (pieceSize > 0 && pieceSize + block.size > MAX_CHUNK_CHARS) {
      pieces.push(piece(body, startLine, pieceFrom, block.from));
      pieceFrom = block.from;
      pieceSize = 0;
    }
    pieceSize += block.size;
  }
  pieces.push(piece(body, startLine, pieceFrom, body.length));
  return pieces.filter((p) => p.text.trim() !== "");
}

/** Removes fenced code blocks so links and tags inside code are ignored. */
function stripFencedCode(text: string): string {
  const kept: string[] = [];
  let fence: string | null = null;
  for (const line of text.split("\n")) {
    const match = FENCE.exec(line);
    if (match) {
      const marker = match[1]!;
      if (fence === null) fence = marker[0]!.repeat(marker.length);
      else if (marker.startsWith(fence)) fence = null;
      continue;
    }
    if (fence === null) kept.push(line);
  }
  return kept.join("\n");
}

function piece(body: string[], offset: number, from: number, to: number) {
  return { text: body.slice(from, to).join("\n"), startLine: offset + from, endLine: offset + to };
}

function basename(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

function asList(value: FrontmatterValue | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function stripHash(tag: string): string {
  return tag.replace(/^#/, "");
}

function unquote(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      // JSON-quoted strings are valid YAML scalars (used by fixed note templates).
      const decoded: unknown = JSON.parse(value);
      if (typeof decoded === "string") return decoded;
    } catch {
      // Keep the parser's existing tolerance for non-JSON YAML strings.
    }
  }
  return value.replace(/^(["'])(.*)\1$/, "$2");
}
