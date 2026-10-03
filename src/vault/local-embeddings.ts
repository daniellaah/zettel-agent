import { FileSystemAdapter, type App } from "obsidian";
import os from "node:os";
import path from "node:path";
import type { PluginSettings } from "../settings";
import type { Corpus } from "../retrieval/corpus";
import { hash } from "../retrieval/markdown";
import { LocalHybridSearch, type SearchPort } from "../retrieval/local-search";
import { OllamaEmbeddingProvider } from "../retrieval/ollama";
import { ExactVectorIndex } from "../retrieval/vector";
import { embeddingCacheDirectory, FileEmbeddingCache } from "./embedding-cache";
import { localOllamaFetch } from "./local-http";

/** Lifecycle maintenance owned by the plugin, never called from Agent tools. */
export class LocalEmbeddings {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private controller: AbortController | undefined;
  private reader: LocalHybridSearch | undefined;
  private index: ExactVectorIndex | undefined;
  private message = "Not built. Start Ollama and enable local hybrid retrieval.";
  private generation = 0;
  private disposed = false;
  private pending: Promise<void> = Promise.resolve();
  constructor(
    private readonly app: App,
    private readonly settings: () => PluginSettings,
    private readonly current: () => Corpus,
    private readonly ready: () => Promise<void>,
    private readonly options: { cacheRoot?: string; fetch?: typeof fetch } = {},
  ) {}

  get status(): string {
    if (this.index && this.index.status(this.current()) === "stale")
      return "Index changed; waiting for local rebuild. Search uses BM25 until ready.";
    return this.message;
  }
  /** Replay remains network-free, including local embedding requests. */
  readonly search: SearchPort = async (corpus, query, options, signal) => {
    if (this.settings().retrievalMode === "lexical" || this.settings().recordingMode === "replay")
      return {
        hits: corpus.search(query, { ...options, limit: Number.MAX_SAFE_INTEGER }),
        mode: "lexical",
        revision: corpus.revision,
        candidateSemantics: "exact",
      };
    if (this.reader) return this.reader.search(corpus, query, options, signal);
    return {
      hits: corpus.search(query, { ...options, limit: Number.MAX_SAFE_INTEGER }),
      mode: "lexical",
      revision: corpus.revision,
      candidateSemantics: "exact",
      fallback: this.message,
    };
  };
  schedule(): void {
    clearTimeout(this.timer);
    this.controller?.abort();
    this.reader = undefined;
    this.index = undefined;
    this.generation++;
    if (
      this.disposed ||
      this.settings().retrievalMode !== "hybrid" ||
      this.settings().recordingMode === "replay"
    ) {
      this.message = "Local embeddings are disabled (BM25 only).";
      return;
    }
    this.message = "Waiting to build local index; search uses BM25 until ready.";
    this.timer = setTimeout(() => {
      void this.rebuild();
    }, 800);
  }
  async rebuild(): Promise<void> {
    clearTimeout(this.timer);
    this.controller?.abort();
    const generation = ++this.generation;
    // Serialize cache maintenance even when a newer revision cancels an earlier build.
    this.pending = this.pending.then(() => this.build(generation));
    return this.pending;
  }
  private async build(generation: number): Promise<void> {
    if (generation !== this.generation) return;
    this.reader = undefined;
    this.index = undefined;
    if (
      this.disposed ||
      this.settings().retrievalMode !== "hybrid" ||
      this.settings().recordingMode === "replay"
    ) {
      this.message = "Enable local hybrid retrieval with Replay off before building.";
      return;
    }
    const controller = new AbortController();
    this.controller = controller;
    this.message = "Building local index… Search uses BM25 until ready.";
    try {
      await this.ready();
      controller.signal.throwIfAborted();
      const adapter = this.app.vault.adapter;
      if (!(adapter instanceof FileSystemAdapter))
        throw new Error("Local embeddings require a desktop filesystem vault");
      const vaultRoot = adapter.getBasePath();
      const cacheDirectory = path.join(
        this.options.cacheRoot ??
          embeddingCacheDirectory(process.platform, os.homedir(), process.env.XDG_CACHE_HOME),
        hash(path.resolve(vaultRoot)),
      );
      const cache = await FileEmbeddingCache.open(cacheDirectory, vaultRoot);
      const provider = await OllamaEmbeddingProvider.connect(
        this.settings().ollamaEndpoint,
        this.options.fetch ?? localOllamaFetch,
        controller.signal,
      );
      const corpus = this.current();
      const index = new ExactVectorIndex(provider.config);
      const result = await index.rebuild(corpus, provider, cache, controller.signal);
      controller.signal.throwIfAborted();
      if (
        generation !== this.generation ||
        corpus !== this.current() ||
        index.status(corpus) !== "complete"
      )
        return;
      this.index = index;
      this.reader = new LocalHybridSearch(index, provider, (signal) =>
        provider.assertIdentity(signal),
      );
      this.message = `Ready: ${index.size} sections; ${result.cachedSections} cached, ${result.encodedSections} encoded locally. No embedding API charge.`;
    } catch (error) {
      if (generation === this.generation && !controller.signal.aborted)
        this.message = `Local index unavailable: ${error instanceof Error ? error.message : "unknown error"}. Search uses BM25. Retry after checking Ollama.`;
    }
  }
  dispose(): void {
    this.disposed = true;
    this.generation++;
    clearTimeout(this.timer);
    this.controller?.abort();
    this.reader = undefined;
  }
}
