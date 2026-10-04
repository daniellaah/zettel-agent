import type { PluginSettings } from "../settings";

export const NOTE_KINDS = ["fleeting", "literature", "permanent"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const NOTE_LABELS: Record<NoteKind, string> = {
  fleeting: "Fleeting",
  literature: "Literature",
  permanent: "Permanent",
};

/** Obsidian (Lucide) icon names. */
export const NOTE_ICONS: Record<NoteKind, string> = {
  fleeting: "feather",
  literature: "book-open",
  permanent: "lightbulb",
};

export const NOTE_HINTS: Record<NoteKind, string> = {
  fleeting: "Capture a quick thought",
  literature: "Paraphrase a source",
  permanent: "Develop one idea",
};

export interface NoteDraft {
  kind: NoteKind;
  title: string;
  sourceTitle?: string;
  author?: string;
  year?: string;
  source?: string;
  /** An existing note explicitly chosen by the user, not a model suggestion. */
  sourceNote?: string;
}

export interface NotePlan {
  path: string;
  folder: string;
  content: string;
  /** Blank line where the user starts writing in the editor. */
  cursorLine: number;
}

/** Local calendar date, rather than UTC's date near midnight. */
export function noteDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Fixed scaffolds only: no model calls, executable templates or generated prose. */
export function planNote(
  draft: NoteDraft,
  settings: Pick<PluginSettings, "zettelkastenRoot" | "stageFolders">,
  date: Date,
): NotePlan {
  const title = draft.title.trim().replace(/\.md$/i, "").trim();
  if (!title || title === "." || title === ".." || /[\\/\p{Cc}<>:"|?*#^[\]]/u.test(title)) {
    throw new Error("Enter a title without path separators or reserved filename/link characters.");
  }
  if (title.endsWith(".")) throw new Error("The title cannot end with a period.");

  const parts = [settings.zettelkastenRoot, settings.stageFolders[draft.kind]]
    .filter((part) => part !== "")
    .flatMap((part) => part.split("/"));
  if (
    parts.some(
      (part) =>
        !part.trim() ||
        part !== part.trim() ||
        part === "." ||
        part === ".." ||
        [".obsidian", ".trash"].includes(part.toLowerCase()) ||
        /[\\\p{Cc}<>:"|?*#^[\]]/u.test(part),
    )
  ) {
    throw new Error("Choose valid vault-relative note folders in Settings → Zettel Agent.");
  }
  const folder = parts.join("/");
  const path = `${folder ? `${folder}/` : ""}${title}.md`;
  const fields = [`type: ${draft.kind}`, `created: ${noteDate(date)}`];
  const body = [`# ${title}`, ""];

  if (draft.kind === "fleeting") {
    fields.push("tags: [inbox]");
  } else if (draft.kind === "literature") {
    fields.push(
      `source_title: ${JSON.stringify(draft.sourceTitle?.trim() ?? "")}`,
      `author: ${JSON.stringify(draft.author?.trim() ?? "")}`,
      `year: ${JSON.stringify(draft.year?.trim() ?? "")}`,
      `source: ${JSON.stringify(draft.source?.trim() ?? "")}`,
    );
  } else {
    fields.push(
      draft.sourceNote ? `source:\n  - ${JSON.stringify(draft.sourceNote)}` : "source: []",
    );
  }

  const frontmatter = ["---", ...fields, "---", ""].flatMap((line) => line.split("\n"));
  // Every kind opens on the blank writing line immediately below its title.
  const cursorLine = frontmatter.length + 2;
  return { path, folder, content: [...frontmatter, ...body, ""].join("\n"), cursorLine };
}
