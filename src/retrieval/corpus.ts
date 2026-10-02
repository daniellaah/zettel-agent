import { STAGES, type Stage } from "../settings";
import { LinkGraph, basenameResolver, type LinkResolver } from "./graph";
import { LexicalIndex, type SearchHit } from "./lexical-index";
import { parseNote, type ParsedNote } from "./markdown";
import type { TokenizerMode } from "./tokenize";

export interface CorpusOptions {
  mode?: TokenizerMode;
  /** Stage from the note's folder; a frontmatter `type` naming a stage overrides it. */
  stageForPath: (path: string) => Stage | null;
  /** Link resolution; defaults to basename matching over the corpus's own notes. */
  resolver?: LinkResolver;
}

export interface CorpusSearchOptions {
  limit?: number;
  perNote?: number;
  stages?: Stage[];
  /** Vault-relative folder prefix. */
  folder?: string;
  tag?: string;
}

/** The notes the agent can see, with their search index and link graph. */
export class Corpus {
  private readonly notes = new Map<string, ParsedNote>();
  private readonly index: LexicalIndex;
  private cachedGraph: LinkGraph | null = null;
  private cachedResolver: LinkResolver | null = null;

  constructor(private readonly options: CorpusOptions) {
    this.index = new LexicalIndex(options.mode ?? "both");
  }

  get size(): number {
    return this.notes.size;
  }

  paths(): string[] {
    return [...this.notes.keys()].sort();
  }

  get(path: string): ParsedNote | undefined {
    return this.notes.get(path);
  }

  upsert(path: string, content: string): ParsedNote {
    const existing = this.notes.get(path);
    const note = parseNote(path, content);
    const stage =
      note.type && (STAGES as readonly string[]).includes(note.type)
        ? note.type
        : this.options.stageForPath(path);
    // Captures remain in the vault but are outside every research tool's corpus.
    if (stage === "fleeting") {
      this.remove(path);
      return note;
    }
    if (existing?.contentHash === note.contentHash) return existing;
    this.notes.set(path, note);
    this.index.upsert(note);
    this.invalidate();
    return note;
  }

  remove(path: string): void {
    if (!this.notes.delete(path)) return;
    this.index.remove(path);
    this.invalidate();
  }

  rename(oldPath: string, newPath: string, content: string): void {
    this.remove(oldPath);
    this.upsert(newPath, content);
  }

  private invalidate(): void {
    this.cachedGraph = null;
    // A custom resolver (Obsidian's) tracks vault changes itself; the fallback must be rebuilt.
    if (!this.options.resolver) this.cachedResolver = null;
  }

  stage(path: string): Stage | null {
    const type = this.notes.get(path)?.type;
    if (type && (STAGES as readonly string[]).includes(type)) return type as Stage;
    return this.options.stageForPath(path);
  }

  graph(): LinkGraph {
    if (!this.cachedGraph) {
      const rawLinks = new Map([...this.notes].map(([path, note]) => [path, note.links]));
      this.cachedGraph = LinkGraph.build(rawLinks, (target, source) =>
        this.resolve(target, source),
      );
    }
    return this.cachedGraph;
  }

  /**
   * Resolves a vault path, a note title or a `[[link]]` to a note in this corpus.
   * Links that resolve to notes outside the corpus count as unresolved.
   */
  resolve(target: string, sourcePath = ""): string | null {
    const cleaned = target
      .trim()
      .replace(/^!?\[\[|\]\]$/g, "")
      .replace(/[#|^].*$/, "");
    if (this.notes.has(cleaned)) return cleaned;
    if (this.notes.has(`${cleaned}.md`)) return `${cleaned}.md`;
    this.cachedResolver ??= this.options.resolver ?? basenameResolver(this.notes.keys());
    const resolved = this.cachedResolver(cleaned, sourcePath);
    return resolved !== null && this.notes.has(resolved) ? resolved : null;
  }

  search(query: string, options: CorpusSearchOptions = {}): SearchHit[] {
    const { stages, folder, tag } = options;
    const prefix = folder ? `${folder.replace(/\/+$/, "")}/` : null;
    const wantedTag = tag?.replace(/^#/, "").toLowerCase();
    return this.index.search(query, {
      limit: options.limit ?? 10,
      perNote: options.perNote ?? 1,
      filter: (path) => {
        if (prefix && !path.startsWith(prefix)) return false;
        if (stages && stages.length > 0) {
          const stage = this.stage(path);
          if (!stage || !stages.includes(stage)) return false;
        }
        if (wantedTag) {
          const tags = this.notes.get(path)?.tags ?? [];
          if (
            !tags.some(
              (t) => t.toLowerCase() === wantedTag || t.toLowerCase().startsWith(`${wantedTag}/`),
            )
          )
            return false;
        }
        return true;
      },
    });
  }
}
