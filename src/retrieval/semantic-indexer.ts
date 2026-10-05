import type { Corpus, Fusion } from "./corpus";
import type { DenseIndex } from "./dense-index";
import type { Embedder } from "./embedding";
import { decodeVectors, encodeVectors } from "./vector-file";

/** Vectors for one round of search queries, and how to fuse them with keywords. */
export interface QueryVectors {
  fusion: Fusion;
  vectors: ReadonlyMap<string, Float32Array>;
}

export type SemanticStatus =
  | { state: "connecting" }
  | { state: "unavailable"; message: string }
  | { state: "indexing"; embedded: number; total: number }
  | { state: "ready"; embedded: number; total: number };

/** Where vectors persist between sessions, e.g. a file in the plugin folder. */
export interface VectorStore {
  load(): Promise<Uint8Array | null>;
  save(bytes: Uint8Array): Promise<void>;
}

/**
 * Share of sections that need vectors before search fuses in meaning. Below it, results
 * would favour already-embedded notes, so search stays keyword-only.
 */
export const READY_COVERAGE = 0.95;

export interface SemanticIndexerOptions {
  connect: () => Promise<Embedder>;
  store: VectorStore;
  /** The current corpus; the vault may replace it when it rebuilds. */
  corpus: () => Corpus;
  fusion: Fusion;
  onStatus?: (status: SemanticStatus) => void;
  batchSize?: number;
  saveDelayMs?: number;
  queryTimeoutMs?: number;
}

/**
 * Keeps the corpus's section vectors up to date in the background: cached vectors first,
 * then the embedder for whatever is new or changed. Search keeps working on keywords alone
 * until enough sections are embedded, and whenever the embedder cannot be reached.
 */
export class SemanticIndexer {
  private embedder: Embedder | null = null;
  /** Every vector known for this embedder by text key: the saved cache plus new ones. */
  private readonly cache = new Map<string, Float32Array>();
  private running: Promise<void> | null = null;
  private again = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  status: SemanticStatus = { state: "connecting" };

  constructor(private readonly options: SemanticIndexerOptions) {}

  /** Connects, loads saved vectors and embeds whatever the corpus still needs. */
  async start(): Promise<void> {
    try {
      this.embedder = await this.options.connect();
    } catch (error) {
      this.setStatus({ state: "unavailable", message: messageOf(error) });
      return;
    }
    // Vectors already in the corpus may come from another model; this embedder's cache
    // refills whatever it can.
    this.options.corpus().resetVectors();
    try {
      const bytes = await this.options.store.load();
      const file = bytes && decodeVectors(bytes);
      if (file && file.embedder === this.embedder.id)
        for (const [key, vector] of file.vectors) this.cache.set(key, vector);
    } catch {
      // A missing or damaged cache only means re-embedding.
    }
    this.refresh();
  }

  /** Call when the corpus changes or is replaced. */
  refresh(): void {
    if (!this.embedder || this.stopped) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        this.refresh();
      }
    });
  }

  /** Resolves once the current round of embedding has finished. */
  async idle(): Promise<void> {
    while (this.running) await this.running;
  }

  /** Query vectors when the index is ready, or null to search by keywords alone. */
  async queryVectors(queries: string[], signal?: AbortSignal): Promise<QueryVectors | null> {
    const dense = this.options.corpus().dense;
    if (!this.embedder || !dense || this.stopped || queries.length === 0) return null;
    const { embedded, total } = dense.coverage();
    if (total === 0 || embedded / total < READY_COVERAGE) return null;
    try {
      const vectors = await withTimeout(
        this.embedder.embed(queries, "query", signal),
        this.options.queryTimeoutMs ?? 10_000,
      );
      return {
        fusion: this.options.fusion,
        vectors: new Map(queries.map((query, i) => [query, vectors[i]!])),
      };
    } catch {
      return null;
    }
  }

  /** Stops embedding and saves what is already embedded. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      await this.save();
    }
  }

  private async run(): Promise<void> {
    const embedder = this.embedder!;
    const batchSize = this.options.batchSize ?? 32;
    for (;;) {
      // Re-read the corpus each round: a rebuild may have replaced it meanwhile.
      const dense = this.options.corpus().dense;
      if (!dense || this.stopped) return;
      const pending = this.fillFromCache(dense);
      this.report(dense);
      if (pending.length === 0) return;
      const batch = pending.slice(0, batchSize);
      let vectors: Float32Array[];
      try {
        vectors = await embedder.embed(
          batch.map((entry) => entry.text),
          "document",
        );
      } catch (error) {
        // Retried on the next change or restart; keyword search keeps working.
        this.setStatus({ state: "unavailable", message: messageOf(error) });
        return;
      }
      batch.forEach(({ key }, i) => this.cache.set(key, vectors[i]!));
      this.scheduleSave();
    }
  }

  /** Gives sections their cached vectors and returns those still missing one. */
  private fillFromCache(dense: DenseIndex): { key: string; text: string }[] {
    return dense.pending().filter(({ key }) => {
      const vector = this.cache.get(key);
      if (vector) dense.set(key, vector);
      return !vector;
    });
  }

  private report(dense: DenseIndex): void {
    const { embedded, total } = dense.coverage();
    this.setStatus({ state: embedded === total ? "ready" : "indexing", embedded, total });
  }

  private setStatus(status: SemanticStatus): void {
    this.status = status;
    this.options.onStatus?.(status);
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, this.options.saveDelayMs ?? 5000);
  }

  /** Saves the vectors the current corpus uses, so the cache never outgrows the vault. */
  private async save(): Promise<void> {
    const dense = this.options.corpus().dense;
    if (!this.embedder || !dense) return;
    const vectors = dense.usedVectors();
    const first = vectors.values().next().value;
    if (!first) return;
    try {
      await this.options.store.save(
        encodeVectors({ embedder: this.embedder.id, dimensions: first.length, vectors }),
      );
    } catch {
      // Saving is an optimization; the next session re-embeds what is missing.
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
