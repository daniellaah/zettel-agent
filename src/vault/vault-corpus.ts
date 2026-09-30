import { TFile, type App, type Plugin } from "obsidian";

import { Corpus } from "../retrieval/corpus";
import { isInZettelkasten, stageForPath, type PluginSettings } from "../settings";

/**
 * Keeps a Corpus in sync with the Zettelkasten folder: a full build on load or when the
 * folder setting changes, then incremental updates from vault events. Read-only: this
 * class reads files and never writes them.
 */
export class VaultCorpus {
  private corpus: Corpus;
  private building: Promise<void> | null = null;
  /** Paths changed while a rebuild was reading the vault; re-read after it swaps in. */
  private readonly changedDuringBuild = new Set<string>();

  constructor(
    private readonly app: App,
    private readonly settings: () => PluginSettings,
  ) {
    this.corpus = this.createCorpus();
  }

  get current(): Corpus {
    return this.corpus;
  }

  /** Resolves once the most recent build has finished. */
  whenReady(): Promise<void> {
    return this.building ?? Promise.resolve();
  }

  rebuild(): Promise<void> {
    const build = this.build();
    this.building = build;
    void build.finally(() => {
      if (this.building === build) this.building = null;
    });
    return build;
  }

  registerEvents(plugin: Plugin): void {
    const { vault } = this.app;
    plugin.registerEvent(vault.on("modify", (file) => void this.update(file.path)));
    plugin.registerEvent(vault.on("create", (file) => void this.update(file.path)));
    plugin.registerEvent(vault.on("delete", (file) => this.remove(file.path)));
    plugin.registerEvent(
      vault.on("rename", (file, oldPath) => {
        this.remove(oldPath);
        void this.update(file.path);
      }),
    );
  }

  private createCorpus(): Corpus {
    return new Corpus({
      stageForPath: (path) => stageForPath(path, this.settings()),
      // Obsidian's own resolution, so the agent sees the same links the user does.
      resolver: (target, source) =>
        this.app.metadataCache.getFirstLinkpathDest(target, source)?.path ?? null,
    });
  }

  private async build(): Promise<void> {
    const corpus = this.createCorpus();
    this.changedDuringBuild.clear();
    const files = this.app.vault.getMarkdownFiles().filter((file) => this.inScope(file.path));
    const BATCH = 50;
    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH);
      const contents = await Promise.all(batch.map((file) => this.app.vault.cachedRead(file)));
      batch.forEach((file, j) => corpus.upsert(file.path, contents[j]!));
    }
    this.corpus = corpus;
    const pending = [...this.changedDuringBuild];
    this.changedDuringBuild.clear();
    await Promise.all(pending.map((path) => this.update(path)));
  }

  private async update(path: string): Promise<void> {
    if (this.building) this.changedDuringBuild.add(path);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.extension !== "md" || !this.inScope(path)) {
      this.corpus.remove(path);
      return;
    }
    this.corpus.upsert(path, await this.app.vault.cachedRead(file));
  }

  private remove(path: string): void {
    if (this.building) this.changedDuringBuild.add(path);
    this.corpus.remove(path);
  }

  private inScope(path: string): boolean {
    return path.endsWith(".md") && isInZettelkasten(path, this.settings().zettelkastenRoot);
  }
}
