import type { ConversationRecord, ConversationStore } from "./chat-session";
import { summarize, upsertSummary, type ConversationSummary } from "./conversation-index";
import {
  SerialStorage,
  recoverableRead,
  recoverableWrite,
  type StorageAdapter,
} from "./recoverable-storage";
import { parseConversation, storageId } from "./storage-schema";

/** Individual files are authoritative; a stale/corrupt legacy index cannot hide chats. */
export class ConversationStorage implements ConversationStore {
  private readonly queue = new SerialStorage();
  constructor(
    private readonly adapter: StorageAdapter,
    private readonly dir: string,
    private readonly notify: (message: string) => void = () => {},
  ) {}

  list(): Promise<ConversationSummary[]> {
    return this.queue.run(async () => {
      if (!(await this.adapter.exists(this.dir))) return [];
      const { files } = await this.adapter.list(this.dir);
      const ids = new Set(
        files.flatMap((file) => {
          if (!file.startsWith(`${this.dir}/`)) return [];
          const name = file.slice(this.dir.length + 1);
          const match = /^([A-Za-z0-9][A-Za-z0-9_-]{0,127})\.json(?:\.pending|\.bak)?$/.exec(name);
          return match && match[1] !== "index" ? [match[1]!] : [];
        }),
      );
      let summaries: ConversationSummary[] = [];
      for (const id of ids) {
        try {
          const record = await this.read(id);
          if (record) summaries = upsertSummary(summaries, summarize(record));
        } catch {
          this.notify("A damaged chat was skipped. Its storage files were retained.");
        }
      }
      return summaries;
    });
  }

  load(id: string): Promise<ConversationRecord | null> {
    storageId.parse(id);
    return this.queue.run(() => this.read(id));
  }

  save(record: ConversationRecord): Promise<void> {
    const snapshot = parseConversation(structuredClone(record));
    return this.queue.run(async () => {
      const path = this.path(snapshot.id);
      if (await this.adapter.exists(`${path}.deleted`))
        throw new Error("This chat was deleted; stale saves are refused.");
      const previous = await this.read(snapshot.id);
      if (previous && Date.parse(previous.updatedAt) > Date.parse(snapshot.updatedAt))
        throw new Error("Refusing to overwrite a newer chat.");
      await recoverableWrite(this.adapter, path, JSON.stringify(snapshot));
    });
  }

  delete(id: string): Promise<void> {
    storageId.parse(id);
    return this.queue.run(async () => {
      const path = this.path(id);
      // Persistent tombstone prevents interrupted deletion or late turn saves resurrecting it.
      await this.adapter.write(`${path}.deleted`, "deleted");
      for (const candidate of [path, `${path}.pending`, `${path}.bak`]) {
        if (await this.adapter.exists(candidate)) await this.adapter.remove(candidate);
      }
    });
  }

  private async read(id: string): Promise<ConversationRecord | null> {
    const path = this.path(id);
    if (await this.adapter.exists(`${path}.deleted`)) return null;
    return recoverableRead(
      this.adapter,
      path,
      (value) => parseConversation(value, id),
      this.notify,
    );
  }
  private path(id: string): string {
    return `${this.dir}/${storageId.parse(id)}.json`;
  }
}
