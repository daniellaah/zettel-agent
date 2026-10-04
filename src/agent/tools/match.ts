import { z } from "zod";

import { continuation, cursorPosition, quoteData, ToolFault } from "../tool-contract";
import { type ParsedNote, type Section } from "../../retrieval/markdown";
import {
  cursorSchema,
  defineTool,
  Delivery,
  filters,
  queryKey,
  resolveTarget,
  sectionLabel,
  truncate,
} from "./shared";

const MAX_REGEX_LENGTH = 200;

const matchInput = z
  .object({
    pattern: z.string().min(1).max(MAX_REGEX_LENGTH),
    regex: z
      .boolean()
      .optional()
      .describe(
        "Fixed-width regex subset: literals, classes, dot, anchors, character escapes; no groups, alternation, quantifiers or backreferences.",
      ),
    case_sensitive: z.boolean().optional(),
    ...filters,
    target: z.string().optional().describe("Optional exact note path or unambiguous title."),
    context_lines: z.number().int().min(0).max(3).optional(),
    limit: z.number().int().min(1).max(50).optional(),
    cursor: cursorSchema,
  })
  .strict();

export const matchTool = defineTool({
  name: "match",
  schema: matchInput,
  description:
    "Exact literal or bounded regex line search with shared filters, line identities, optional context and continuation. Exhaustion describes only this query's scope.",
  run: (input, context) => {
    const { corpus } = context;
    const matcher = boundedMatcher(
      input.pattern,
      input.regex ?? false,
      input.case_sensitive ?? false,
    );
    const target = input.target ? resolveTarget(corpus, input.target) : undefined;
    const effective = {
      ...input,
      regex: input.regex ?? false,
      case_sensitive: input.case_sensitive ?? false,
      context_lines: input.context_lines ?? 0,
      limit: input.limit ?? 20,
      ...(target && { target }),
    };
    const key = queryKey("match", effective);
    const offset = cursorPosition(corpus, key, input.cursor);
    const matches: {
      note: ParsedNote;
      section: Section;
      line: number;
      text: string;
      start: number;
      end: number;
      clipped: boolean;
    }[] = [];
    for (const path of corpus.paths()) {
      if ((target && path !== target) || !corpus.eligible(path, input)) continue;
      const note = corpus.get(path)!;
      for (const section of note.sections) {
        const lines = section.text.split("\n");
        let start = 0;
        lines.forEach((line, i) => {
          if (matcher.test(line)) {
            const from = Math.max(0, i - effective.context_lines);
            const to = Math.min(lines.length, i + effective.context_lines + 1);
            matches.push({
              note,
              section,
              line: section.startLine + i + 1,
              text: lines
                .slice(from, to)
                .map((text, j) => `${section.startLine + from + j + 1}: ${truncate(text, 300)}`)
                .join("\n"),
              start,
              end: start + Math.min(line.length, 300),
              clipped: lines.slice(from, to).some((line) => line.length > 300),
            });
          }
          start += line.length + 1;
        });
      }
    }
    const page = matches.slice(offset, offset + effective.limit);
    const delivery = new Delivery(context, "match", effective, "lines");
    const rows = page.map(({ note, section, line, text, start, end }) => {
      const id = delivery.add(note, section, "matched-line", text, { start, end, line });
      return `[${id}] ${note.path}:${line} (${sectionLabel(section)})\n  ${text}`;
    });
    const more = offset + page.length < matches.length;
    return delivery.finish(
      `<note_lines>\n${quoteData(rows.join("\n") || "No line matches in these filters.")}\n</note_lines>`,
      `match ${JSON.stringify(input.pattern)} → ${page.length}/${matches.length} lines${more ? "; more" : ""}`,
      page.length,
      matches.length,
      more,
      more || page.some((row) => row.clipped),
      more ? continuation(corpus, key, offset + page.length) : undefined,
    );
  },
});

/** Fixed-width regexes have no nested/unbounded backtracking, even on hostile long lines. */
export function boundedMatcher(pattern: string, regex: boolean, caseSensitive: boolean): RegExp {
  if (pattern.length > MAX_REGEX_LENGTH)
    throw new ToolFault("invalid-regex", "Pattern too long. Use at most 200 characters.");
  if (regex) {
    let inClass = false;
    for (let i = 0; i < pattern.length; i++) {
      const char = pattern[i]!;
      if (char === "\\") {
        const escaped = pattern[++i];
        if (!escaped || !/[dDsSwWtnr\\.[\]{}()*+?^$|/-]/.test(escaped))
          throw new ToolFault(
            "invalid-regex",
            "Unsupported regex escape. Use fixed-width character classes or literal mode.",
          );
      } else if (char === "[") inClass = true;
      else if (char === "]") inClass = false;
      else if (!inClass && /[()*+?{}|]/.test(char))
        throw new ToolFault(
          "invalid-regex",
          "Regex groups, alternation and quantifiers are unsupported. Use literal mode or a fixed-width pattern.",
        );
    }
  }
  try {
    return new RegExp(
      regex ? pattern : pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      caseSensitive ? "u" : "iu",
    );
  } catch {
    throw new ToolFault("invalid-regex", "Invalid regex. Fix syntax or use literal mode.");
  }
}
