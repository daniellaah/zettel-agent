import { CITATION, idsInCitation } from "../agent/evidence";

/**
 * Rewrites [E3] / [E3, E7] citations in Markdown as inline HTML chips before rendering, so
 * raw citation text never reaches the DOM, whatever Obsidian's renderer does afterwards.
 * Fenced code blocks and inline code are left untouched. The evidence id is carried in a
 * class (za-cite-E3): the Markdown HTML sanitizer keeps classes.
 */
export function citationsToHtml(markdown: string): string {
  const out: string[] = [];
  let inFence: string | null = null;
  for (const line of markdown.split("\n")) {
    const fence = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const marker = fence[1]!;
      if (inFence === null) inFence = marker[0]!.repeat(marker.length);
      else if (marker.startsWith(inFence)) inFence = null;
      out.push(line);
      continue;
    }
    out.push(inFence === null ? convertOutsideInlineCode(line) : line);
  }
  return out.join("\n");
}

function convertOutsideInlineCode(line: string): string {
  // Split into alternating [text, `code`, text, ...] segments.
  return line
    .split(/(`[^`]*`)/)
    .map((segment, index) => (index % 2 === 1 ? segment : convert(segment)))
    .join("");
}

function convert(text: string): string {
  return text.replace(CITATION, (_whole, inner: string) =>
    idsInCitation(inner)
      .map((id) => `<span class="za-cite za-cite-${id}">${id.slice(1)}</span>`)
      .join(""),
  );
}

/** The evidence id carried by a rendered chip's class, e.g. za-cite-E3 → "E3". */
export function citationIdOf(element: Element): string | null {
  for (const name of Array.from(element.classList)) {
    const match = /^za-cite-(E\d+)$/.exec(name);
    if (match) return match[1]!;
  }
  return null;
}
