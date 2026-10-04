import { z } from "zod";

import { continuation, cursorPosition, quoteData } from "../tool-contract";
import {
  cursorSchema,
  defineTool,
  Delivery,
  emptySection,
  filters,
  queryKey,
  resolveTarget,
  sourceSchema,
} from "./shared";

const linksInput = z
  .object({
    target: z.string().min(1).max(2000),
    source_path: sourceSchema,
    depth: z.union([z.literal(1), z.literal(2)]).optional(),
    direction: z.enum(["both", "outgoing", "incoming"]).optional(),
    ...filters,
    limit: z.number().int().min(1).max(100).optional(),
    cursor: cursorSchema,
  })
  .strict();

export const linksTool = defineTool({
  name: "links",
  schema: linksInput,
  description:
    "Resolved connectivity in the research corpus; explicit outgoing/backlink counts and orphan state. Direction/depth/filters bound traversal and neighbors are paginated. Distance two is never a direct edge or semantic agreement.",
  run: (input, context) => {
    const { corpus } = context;
    const path = resolveTarget(corpus, input.target, input.source_path);
    const graph = corpus.graph();
    const effective = {
      ...input,
      target: path,
      depth: input.depth ?? 1,
      direction: input.direction ?? "both",
      limit: input.limit ?? 30,
    };
    const key = queryKey("links", effective);
    const offset = cursorPosition(corpus, key, input.cursor);
    const outgoing = graph.outlinks(path);
    const incoming = graph.backlinks(path);
    const unresolved = graph.unresolvedLinks(path);
    const neighbors = [...graph.neighborhood(path, effective.depth, effective.direction)]
      .filter(([p]) => corpus.eligible(p, input))
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
    const page = neighbors.slice(offset, offset + effective.limit);
    const delivery = new Delivery(context, "links", effective, "neighbors");
    const root = corpus.get(path)!;
    const rootSection = root.sections[0] ?? emptySection(root);
    const facts = `Outgoing (${outgoing.length}); Backlinks (${incoming.length}); isOrphan=${graph.isOrphan(path)}; unresolved (${unresolved.length}): ${unresolved.join(", ")}`;
    const id = delivery.add(root, rootSection, "graph", facts);
    const rows = page.map(([p, distance]) => {
      const note = corpus.get(p)!;
      const relation =
        distance === 2
          ? "Two links away"
          : [outgoing.includes(p) ? "Outgoing" : "", incoming.includes(p) ? "Backlink" : ""]
              .filter(Boolean)
              .join(" + ");
      const text = `${note.title} (${corpus.stage(p) ?? "—"}) ${p}; ${relation}; distance=${distance} from ${path}`;
      const neighborId = delivery.add(note, note.sections[0] ?? emptySection(note), "graph", text);
      return `- [${neighborId}] ${text}`;
    });
    // The root also exposes the displayed edges; omitted neighbors are never registered.
    if (rows.length) delivery.add(root, rootSection, "graph", rows.join("\n"));
    const more = offset + page.length < neighbors.length;
    return delivery.finish(
      `<note_lines>\n${quoteData(`Note: [${id}] ${root.title} (${path})\n${facts}\nGraph scope: accessible research corpus only; edges establish connectivity, not support or contradiction.\n${rows.join("\n")}`)}\n</note_lines>`,
      `links ${root.title} → ${outgoing.length} out, ${incoming.length} in`,
      page.length,
      neighbors.length,
      more,
      more,
      more ? continuation(corpus, key, offset + page.length) : undefined,
    );
  },
});
