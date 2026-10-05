import { z } from "zod";

import { continuation, cursorPosition, ToolFault } from "../tool-contract";
import { sectionSubtree } from "../../retrieval/markdown";
import {
  cursorSchema,
  defineTool,
  Delivery,
  emptySection,
  MAX_OUTPUT,
  noteBlock,
  queryKey,
  resolveTarget,
  sectionLabel,
  sourceSchema,
  splitHeading,
} from "./shared";

const READ_CHARS = 12_000;

const readInput = z
  .object({
    target: z
      .string()
      .min(1)
      .max(2000)
      .describe(
        "E3, exact path/title, or path#Heading. An E id expands its section/subsections; a bare path reads the body.",
      ),
    mode: z.enum(["body", "outline"]).optional(),
    section_id: z
      .string()
      .optional()
      .describe("Select an exact section from outline, including repeated headings."),
    source_path: sourceSchema,
    max_chars: z
      .number()
      .int()
      .min(100)
      .max(READ_CHARS)
      .optional()
      .describe("Body characters per page, wrappers/metadata separately bounded."),
    cursor: cursorSchema,
  })
  .strict();

export const readTool = defineTool({
  name: "read",
  schema: readInput,
  description:
    "Bounded body or outline pages with exact section IDs and revision-bound continuation. Title/outline/metadata evidence is distinct from body evidence. Continue until required text is complete.",
  run: (input, context) => {
    const { corpus, ledger } = context;
    const target = input.target.trim();
    const isId = /^E\d+$/i.test(target);
    const evidence = isId ? ledger.get(target) : undefined;
    if (isId && !evidence)
      throw new ToolFault(
        "stale-reference",
        `Unknown evidence id ${target}. Search or list a current target.`,
      );
    const [pathPart, heading] = evidence ? [evidence.path, undefined] : splitHeading(target);
    const path = evidence ? evidence.path : resolveTarget(corpus, pathPart, input.source_path);
    const note = corpus.get(path);
    if (!note)
      throw new ToolFault(
        evidence ? "stale-reference" : "missing-target",
        "Target is no longer accessible. Search or list its current exact path.",
      );
    let sections = note.sections;
    const chosenId = input.section_id ?? evidence?.sectionId;
    if (chosenId) {
      sections = sectionSubtree(note, chosenId);
      if (!sections.length && !(note.sections.length === 0 && chosenId === emptySection(note).id))
        throw new ToolFault(
          "stale-reference",
          "The referenced section no longer exists. Read the current note outline and select a current section_id.",
        );
    } else if (heading) {
      const starts = note.sections.filter(
        (s) =>
          s.headingPath.at(-1)?.toLowerCase() === heading.toLowerCase() ||
          s.headingPath.join(" › ").toLowerCase() === heading.toLowerCase(),
      );
      if (!starts.length)
        throw new ToolFault(
          "missing-target",
          `Heading not found. Headings: ${note.sections
            .map((s) => s.headingPath.at(-1))
            .filter(Boolean)
            .join(" | ")}. Read outline.`,
        );
      if (starts.length > 1)
        throw new ToolFault(
          "invalid-input",
          "Ambiguous heading. Read outline and select section_id.",
        );
      sections = sectionSubtree(note, starts[0]!.id);
    }
    const effective = {
      target: path,
      mode: input.mode ?? "body",
      section_id: chosenId ?? (heading ? sections[0]?.id : undefined),
      max_chars: input.max_chars ?? READ_CHARS,
    };
    const key = queryKey("read", { ...effective, contentHash: note.contentHash });
    const offset = cursorPosition(corpus, key, input.cursor);
    const delivery = new Delivery(context, "read", effective, "sections");
    const changed =
      evidence && evidence.contentHash !== note.contentHash
        ? `Note changed since ${evidence.id}; current revision follows. Old citations retain their old revision.\n`
        : "";
    const bodySize = sections.reduce((sum, section) => sum + section.text.length, 0);
    const markupRatio = 2 + (sections.length * 30) / Math.max(1, bodySize);
    const allowance = Math.max(
      0,
      Math.min(
        effective.max_chars,
        Math.floor(((context.maxChars ?? MAX_OUTPUT) - 6000) / markupRatio),
      ),
    );
    if (allowance < 100)
      throw new ToolFault(
        "output-budget",
        "Insufficient output budget. Finish using delivered evidence or begin a new turn.",
      );
    const parts: string[] = [];
    let position = offset;
    let returned = 0;
    let more: boolean;
    if (effective.mode === "outline") {
      let size = 0;
      for (const section of sections.slice(offset)) {
        const text = `${section.id}: ${sectionLabel(section)} (lines ${section.startLine + 1}–${section.endLine})`;
        if (size + text.length > allowance && returned) break;
        if (text.length > allowance)
          throw new ToolFault(
            "output-budget",
            "Heading exceeds page allowance. Increase max_chars or use exact section_id.",
          );
        const id = delivery.add(note, section, "outline", text);
        parts.push(`[${id}] ${text}`);
        size += text.length;
        returned++;
      }
      position += returned;
      more = position < sections.length;
    } else {
      // Canonical body stream uses a single newline between parsed sections. Each page
      // exposes exact section-relative offsets, including oversized single sections.
      const total = bodySize + Math.max(0, sections.length - 1);
      const end = Math.min(total, offset + allowance);
      let base = 0;
      for (const section of sections) {
        const start = Math.max(0, offset - base);
        const stop = Math.min(section.text.length, end - base);
        if (stop > start) {
          const text = section.text.slice(start, stop);
          const id = delivery.add(note, section, "body", text, {
            start,
            end: stop,
            wholeSection: start === 0 && stop === section.text.length,
          });
          parts.push(`[${id}]\n${text}`);
          returned++;
        }
        base += section.text.length + 1;
      }
      position = end;
      more = end < total;
    }
    if (!sections.length) {
      const id = delivery.add(note, emptySection(note), "title", "Empty note body.");
      parts.push(`[${id}] Empty note body.`);
    }
    // Metadata is delivered once per ID, with its own exposure scope.
    for (const section of sections.filter((s) => delivery.hasSection(s.id)))
      delivery.metadata(note, section);
    if (!sections.length) delivery.metadata(note, emptySection(note));
    return delivery.finish(
      noteBlock(corpus, note, changed, parts),
      `read ${note.title}${heading ? `#${heading}` : ""} (${effective.mode === "outline" ? "outline, " : ""}${returned} section${returned === 1 ? "" : "s"}${more ? "; more" : ""})`,
      returned,
      sections.length,
      more,
      more,
      more ? continuation(corpus, key, position) : undefined,
    );
  },
});
