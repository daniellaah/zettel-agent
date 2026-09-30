import { normalizePath, type App } from "obsidian";

import type { ConversationRecord, ConversationStore } from "../session/chat-session";
import {
  removeSummary,
  summarize,
  upsertSummary,
  type ConversationSummary,
} from "../session/conversation-index";

/**
 * Saved conversations: one JSON file each, plus index.json for the history list, in the
 * plugin's folder. They contain questions and note excerpts, never API keys, and are never
 * written into the notes.
 */
export class FileConversationStore implements ConversationStore {
  private index: ConversationSummary[] | null = null;

  constructor(
    private readonly app: App,
    private readonly dir: string,
  ) {}

  async list(): Promise<ConversationSummary[]> {
    if (this.index) return this.index;
    const indexPath = this.path("index.json");
    if (await this.app.vault.adapter.exists(indexPath)) {
      try {
        this.index = JSON.parse(
          await this.app.vault.adapter.read(indexPath),
        ) as ConversationSummary[];
        return this.index;
      } catch {
        // A damaged index is rebuilt from the conversation files below.
      }
    }
    this.index = await this.rebuildIndex();
    return this.index;
  }

  async load(id: string): Promise<ConversationRecord | null> {
    const path = this.path(`${id}.json`);
    if (!(await this.app.vault.adapter.exists(path))) return null;
    return JSON.parse(await this.app.vault.adapter.read(path)) as ConversationRecord;
  }

  async save(record: ConversationRecord): Promise<void> {
    await this.ensureFolder();
    await this.app.vault.adapter.write(this.path(`${record.id}.json`), JSON.stringify(record));
    await this.writeIndex(upsertSummary(await this.list(), summarize(record)));
  }

  /** Deletes a saved conversation; the user asks for this from the history list. */
  async delete(id: string): Promise<void> {
    const path = this.path(`${id}.json`);
    if (await this.app.vault.adapter.exists(path)) await this.app.vault.adapter.remove(path);
    await this.writeIndex(removeSummary(await this.list(), id));
  }

  private async rebuildIndex(): Promise<ConversationSummary[]> {
    if (!(await this.app.vault.adapter.exists(this.dir))) return [];
    const { files } = await this.app.vault.adapter.list(this.dir);
    let summaries: ConversationSummary[] = [];
    for (const file of files) {
      if (!file.endsWith(".json") || file.endsWith("/index.json")) continue;
      try {
        const record = JSON.parse(await this.app.vault.adapter.read(file)) as ConversationRecord;
        summaries = upsertSummary(summaries, summarize(record));
      } catch {
        // Skip unreadable files rather than hiding every conversation.
      }
    }
    return summaries;
  }

  private async writeIndex(index: ConversationSummary[]): Promise<void> {
    this.index = index;
    await this.ensureFolder();
    await this.app.vault.adapter.write(this.path("index.json"), JSON.stringify(index, null, 2));
  }

  private async ensureFolder(): Promise<void> {
    const parts = this.dir.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const partial = parts.slice(0, i).join("/");
      if (!(await this.app.vault.adapter.exists(partial)))
        await this.app.vault.adapter.mkdir(partial);
    }
  }

  private path(name: string): string {
    return normalizePath(`${this.dir}/${name}`);
  }
}
