import { z } from "zod";

import { continuation, cursorPosition, quoteData } from "../tool-contract";
import {
  cursorSchema,
  defineTool,
  Delivery,
  emptySection,
  filters,
  metadataText,
  openingText,
  queryKey,
} from "./shared";

const PREVIEW_CHARS = 200;

const listInput = z
  .object({
    ...filters,
    orphans_only: z.boolean().optional(),
    connection: z.enum(["orphan", "no-backlinks", "no-outlinks"]).optional(),
    preview: z.boolean().optional(),
    limit: z.number().int().min(1).max(200).optional(),
    cursor: cursorSchema,
  })
  .strict();

export const listTool = defineTool({
  name: "list",
  schema: listInput,
  description:
    "Stable path-ordered filtered survey with exact total, degree counts and continuation. Optional previews remain previews. Connection filters distinguish orphan/no-backlinks/no-outlinks.",
  run: (input, context) => {
    const { corpus } = context;
    const graph = corpus.graph();
    const effective = { ...input, preview: input.preview ?? false, limit: input.limit ?? 50 };
    const key = queryKey("list", effective);
    const offset = cursorPosition(corpus, key, input.cursor);
    const paths = corpus
      .paths()
      .filter(
        (path) =>
          corpus.eligible(path, input) &&
          (!input.orphans_only || graph.isOrphan(path)) &&
          (input.connection !== "orphan" || graph.isOrphan(path)) &&
          (input.connection !== "no-backlinks" || graph.backlinks(path).length === 0) &&
          (input.connection !== "no-outlinks" || graph.outlinks(path).length === 0),
      );
    const page = paths.slice(offset, offset + effective.limit);
    const delivery = new Delivery(context, "list", effective, "notes");
    const rows = page.map((path) => {
      const note = corpus.get(path)!;
      const section = note.sections[0] ?? emptySection(note);
      const text = `${note.title} (${corpus.stage(path) ?? "—"}, ${graph.outlinks(path).length} out, ${graph.backlinks(path).length} in)${note.tags.length ? ` #${note.tags.join(" #")}` : ""} ${path}`;
      const opening = input.preview ? openingText(note, PREVIEW_CHARS) : "";
      const id = delivery.add(note, section, "title", text);
      if (opening) delivery.add(note, section, "preview", opening);
      // Degree facts have a structural exposure separate from the title.
      delivery.add(note, section, "graph", text);
      delivery.metadata(note, section);
      return `- [${id}] ${text}${opening ? `\n  ${opening}` : ""}${metadataText(note) ? `\n  ${metadataText(note)}` : ""}`;
    });
    const more = offset + page.length < paths.length;
    return delivery.finish(
      `<note_lines>\n${quoteData(rows.join("\n") || "No notes match these filters.")}\n</note_lines>`,
      `list → ${page.length}/${paths.length} notes (${input.preview ? "previews" : "titles"}${more ? "; more" : ""})`,
      page.length,
      paths.length,
      more,
      more ||
        page.some(
          (path) => input.preview && openingText(corpus.get(path)!, PREVIEW_CHARS).endsWith("…"),
        ),
      more ? continuation(corpus, key, offset + page.length) : undefined,
    );
  },
});
