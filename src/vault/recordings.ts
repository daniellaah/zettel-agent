import { normalizePath, type App } from "obsidian";

import { cassetteFileName, type Cassette } from "../agent/recording";

/**
 * Cassettes (recorded model responses) as JSON files in the plugin's own folder. They hold
 * questions and note excerpts, never API keys, and never go into the notes themselves.
 */
export class RecordingStore {
  constructor(
    private readonly app: App,
    private readonly dir: string,
  ) {}

  async save(cassette: Cassette): Promise<void> {
    const path = this.path(cassetteFileName(cassette.provider, cassette.model, cassette.question));
    await this.ensureFolder(path.slice(0, path.lastIndexOf("/")));
    await this.app.vault.adapter.write(path, `${JSON.stringify(cassette, null, 2)}\n`);
  }

  async load(provider: string, model: string, question: string): Promise<Cassette | null> {
    const path = this.path(cassetteFileName(provider, model, question));
    if (!(await this.app.vault.adapter.exists(path))) return null;
    return JSON.parse(await this.app.vault.adapter.read(path)) as Cassette;
  }

  /** Recorded questions for a provider and model, newest first. */
  async questions(provider: string, model: string): Promise<string[]> {
    const folder = this.path(provider);
    if (!(await this.app.vault.adapter.exists(folder))) return [];
    const { files } = await this.app.vault.adapter.list(folder);
    const cassettes = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => JSON.parse(await this.app.vault.adapter.read(file)) as Cassette),
    );
    return cassettes
      .filter((cassette) => cassette.model === model && cassette.exchanges.length > 0)
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
      .map((cassette) => cassette.question);
  }

  private path(relative: string): string {
    return normalizePath(`${this.dir}/${relative}`);
  }

  private async ensureFolder(folder: string): Promise<void> {
    const parts = folder.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const partial = parts.slice(0, i).join("/");
      if (!(await this.app.vault.adapter.exists(partial)))
        await this.app.vault.adapter.mkdir(partial);
    }
  }
}
