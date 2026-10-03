import { STAGES, type Stage } from "../settings";
import { LinkGraph, basenameResolver, type LinkResolver } from "./graph";
import { LexicalIndex, type SearchHit } from "./lexical-index";
import { hash, parseNote, type ParsedNote } from "./markdown";
import type { TokenizerMode } from "./tokenize";

export interface CorpusOptions {
  mode?: TokenizerMode;
  /** Stage from the note's folder; a frontmatter `type` naming a stage overrides it. */
  stageForPath: (path: string) => Stage | null;
  /** Link resolution; defaults to basename matching over the corpus's own notes. */
  resolver?: LinkResolver;
}

export interface CorpusSearchOptions {
  limit?: number | undefined;
  perNote?: number | undefined;
  stages?: Stage[] | undefined;
  /** Vault-relative folder prefix. */
  folder?: string | undefined;
  tag?: string | undefined;
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

  /** Content/stage/path identity, stable across identical rebuilds. */
  get revision(): string {
    return hash(
      JSON.stringify(
        this.paths().map((path) => [path, this.notes.get(path)!.contentHash, this.stage(path)]),
      ),
    );
  }

  /** Shared filters: an omitted or empty stage array means all research stages. */
  eligible(path: string, options: CorpusSearchOptions = {}): boolean {
    const note = this.notes.get(path);
    if (!note) return false;
    const { stages, folder, tag } = options;
    if (folder && !path.startsWith(`${folder.replace(/\/+$/, "")}/`)) return false;
    if (stages?.length) {
      const stage = this.stage(path);
      if (!stage || !stages.includes(stage)) return false;
    }
    const wanted = tag?.replace(/^#/, "").toLowerCase();
    return (
      !wanted ||
      note.tags.some((t) => t.toLowerCase() === wanted || t.toLowerCase().startsWith(`${wanted}/`))
    );
  }

  /** Bare duplicate names need explicit source context or an exact path. */
  ambiguous(target: string, sourcePath?: string): boolean {
    const cleaned = target
      .trim()
      .replace(/^!?\[\[|\]\]$/g, "")
      .replace(/[#|^].*$/, "");
    const name = cleaned.replace(/\.md$/i, "");
    if (sourcePath || this.notes.has(cleaned) || this.notes.has(`${cleaned}.md`)) return false;
    return (
      this.paths().filter(
        (path) => path.replace(/\.md$/i, "").split("/").pop()?.toLowerCase() === name.toLowerCase(),
      ).length > 1
    );
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
    return this.index.search(query, {
      limit: options.limit ?? 10,
      perNote: options.perNote ?? 1,
      filter: (path) => this.eligible(path, options),
    });
  }
}
