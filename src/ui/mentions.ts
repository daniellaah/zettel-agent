/** Pure helpers for the composer's @-mention popover. */

export interface NoteOption {
  path: string;
  title: string;
  stage: string | null;
}

export interface MentionQuery {
  /** Index of the "@" in the draft. */
  start: number;
  query: string;
}

/**
 * The @-mention being typed at the caret, if any: an "@" at the start or after whitespace,
 * followed by text without line breaks. Spaces are allowed, since note titles have them.
 */
export function mentionAt(draft: string, caret: number): MentionQuery | null {
  const before = draft.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(before[at - 1]!)) return null;
  const query = before.slice(at + 1);
  if (query.includes("\n") || query.length > 60) return null;
  return { start: at, query };
}

/** Notes matching the query: title prefix matches first, then other matches, shortest first. */
export function matchNotes(options: readonly NoteOption[], query: string, limit = 8): NoteOption[] {
  const needle = query.trim().toLowerCase();
  const scored = options.flatMap((option) => {
    const title = option.title.toLowerCase();
    if (needle === "") return [{ option, rank: 1 }];
    if (title.startsWith(needle)) return [{ option, rank: 0 }];
    if (title.includes(needle) || option.path.toLowerCase().includes(needle)) {
      return [{ option, rank: 1 }];
    }
    return [];
  });
  return scored
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.option.title.length - b.option.title.length ||
        a.option.title.localeCompare(b.option.title),
    )
    .slice(0, limit)
    .map(({ option }) => option);
}

/** The draft with the "@query" removed, and where the caret goes. */
export function removeMention(
  draft: string,
  mention: MentionQuery,
  caret: number,
): { draft: string; caret: number } {
  return { draft: draft.slice(0, mention.start) + draft.slice(caret), caret: mention.start };
}
