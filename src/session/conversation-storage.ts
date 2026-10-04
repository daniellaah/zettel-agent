import type { ConversationRecord, ConversationStore } from "./chat-session";
import { parseConversation, storageId } from "./storage-schema";

/** The subset of Obsidian's DataAdapter that chat storage uses. */
export interface StorageAdapter {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  list(path: string): Promise<{ files: string[] }>;
}

/** What the history list shows for a saved conversation. */
export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  questions: number;
}

const FILE = /^([A-Za-z0-9][A-Za-z0-9_-]{0,127})\.json(?:\.pending|\.bak)?$/;

/**
 * Saved chats, one JSON file per conversation in the plugin folder. A save writes
 * `<id>.json.pending` first and keeps the previous file as `<id>.json.bak`, so an interrupted
 * write never loses the last good copy. Operations run one at a time.
 */
export class ConversationStorage implements ConversationStore {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly adapter: StorageAdapter,
    private readonly dir: string,
    private readonly notify: (message: string) => void = () => {},
  ) {}

  /** Newest first. A damaged file is skipped and left in place. */
  list(): Promise<ConversationSummary[]> {
    return this.run(async () => {
      if (!(await this.adapter.exists(this.dir))) return [];
      const { files } = await this.adapter.list(this.dir);
      const ids = new Set(
        files.flatMap((file) => {
          const id = FILE.exec(file.slice(this.dir.length + 1))?.[1];
          // index.json was a shared index in early builds, not a conversation.
          return file.startsWith(`${this.dir}/`) && id && id !== "index" ? [id] : [];
        }),
      );
      const summaries: ConversationSummary[] = [];
      for (const id of ids) {
        try {
          const record = await this.read(id);
          if (record) summaries.push(summarize(record));
        } catch {
          this.notify("A damaged chat was skipped. Its files were kept.");
        }
      }
      return summaries.sort(
        (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
      );
    });
  }

  load(id: string): Promise<ConversationRecord | null> {
    storageId.parse(id);
    return this.run(() => this.read(id));
  }

  save(record: ConversationRecord): Promise<void> {
    // Validate and snapshot now: the caller keeps mutating its state while the save waits.
    const snapshot = parseConversation(structuredClone(record));
    return this.run(async () => {
      const path = this.path(snapshot.id);
      if (!(await this.adapter.exists(this.dir))) await this.mkdirs(this.dir);
      await this.adapter.write(`${path}.pending`, JSON.stringify(snapshot));
      if (await this.adapter.exists(path)) {
        await this.adapter.write(`${path}.bak`, await this.adapter.read(path));
        await this.adapter.remove(path);
      }
      await this.adapter.rename(`${path}.pending`, path);
    });
  }

  delete(id: string): Promise<void> {
    const path = this.path(id);
    return this.run(async () => {
      for (const file of [path, `${path}.pending`, `${path}.bak`]) {
        if (await this.adapter.exists(file)) await this.adapter.remove(file);
      }
    });
  }

  /** A complete pending write is newer than the committed file; the backup is the fallback. */
  private async read(id: string): Promise<ConversationRecord | null> {
    const path = this.path(id);
    let damaged = false;
    for (const file of [`${path}.pending`, path, `${path}.bak`]) {
      if (!(await this.adapter.exists(file))) continue;
      try {
        const record = parseConversation(JSON.parse(await this.adapter.read(file)), id);
        if (file !== path || damaged) {
          this.notify("Recovered a chat after an interrupted save. Recovery files were kept.");
        }
        return record;
      } catch {
        damaged = true;
      }
    }
    if (damaged) throw new Error("This saved chat is damaged. Its files were kept.");
    return null;
  }

  private async mkdirs(folder: string): Promise<void> {
    const parts = folder.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const path = parts.slice(0, i).join("/");
      if (!(await this.adapter.exists(path))) await this.adapter.mkdir(path);
    }
  }

  private path(id: string): string {
    return `${this.dir}/${storageId.parse(id)}.json`;
  }

  /** Runs operations in order; a failed one does not block the next. */
  private run<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(operation);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

function summarize(record: ConversationRecord): ConversationSummary {
  return {
    id: record.id,
    title: record.title,
    updatedAt: record.updatedAt,
    questions: record.items.filter((item) => item.kind === "user").length,
  };
}
