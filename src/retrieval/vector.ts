import type { Corpus, CorpusSearchOptions } from "./corpus";
import { hash, type ParsedNote, type Section } from "./markdown";

/** No provider, model, price or dimension is silently selected. */
export interface EmbeddingConfig {
  provider: string;
  model: string;
  modelVersion: string;
  dimensions: number;
  normalization: "l2";
  metric: "cosine";
  batchSize: number;
  timeoutMs: number;
}
export interface EmbeddingResponse {
  vectors: number[][];
  /** Accounting supplied by the configured adapter; never inferred as zero on failure. */
  usage: { inputTokens: number | null; usd: number | null };
}
export interface EmbeddingProvider {
  config: EmbeddingConfig;
  /** Explicit offline providers must never fall through to live calls on a cache miss. */
  mode: "offline" | "live";
  embed(texts: readonly string[], signal: AbortSignal): Promise<EmbeddingResponse>;
}
export interface VectorRecord {
  key: string;
  path: string;
  sectionId: string;
  contentHash: string;
  representationVersion: string;
  modelIdentity: string;
  /** Precisely records what entered the encoder; note text is untrusted data. */
  input: string;
  vector: number[];
}
export interface EmbeddingCache {
  get(key: string): Promise<VectorRecord | undefined>;
  put(record: VectorRecord): Promise<void>;
  /** Remove obsolete/excluded section entries; successful current cache records survive failures. */
  retain(keys: ReadonlySet<string>): Promise<void>;
}
export interface VectorHit {
  path: string;
  sectionId: string;
  contentHash: string;
  score: number;
}
export interface IndexAccounting {
  expectedSections: number;
  cachedSections: number;
  encodedSections: number;
  requests: number;
  inputCharacters: number;
  inputTokens: number | null;
  usd: number | null;
  elapsedMs: number;
}
export const REPRESENTATION_VERSION = "title-heading-body-v1";

export function modelIdentity(config: EmbeddingConfig): string {
  validateEmbeddingConfig(config);
  return JSON.stringify([
    config.provider,
    config.model,
    config.modelVersion,
    config.dimensions,
    config.normalization,
    config.metric,
  ]);
}
export function validateEmbeddingConfig(config: EmbeddingConfig): void {
  if (
    !config.provider ||
    !config.model ||
    !config.modelVersion ||
    config.normalization !== "l2" ||
    config.metric !== "cosine" ||
    !Number.isInteger(config.dimensions) ||
    config.dimensions < 1 ||
    config.dimensions > 65536 ||
    !Number.isInteger(config.batchSize) ||
    config.batchSize < 1 ||
    config.batchSize > 256 ||
    !Number.isFinite(config.timeoutMs) ||
    config.timeoutMs <= 0
  )
    throw new Error("Explicit valid embedding configuration is required");
}
/** Encoder representation uses bounded title/heading and the complete indexed section body. */
export function embeddingInput(note: ParsedNote, section: Section): string {
  return `Title: ${note.title.slice(0, 500)}\nHeading: ${section.headingPath.join(" › ").slice(0, 1000)}\nBody:\n${section.text}`;
}
export function vectorKey(note: ParsedNote, section: Section, config: EmbeddingConfig): string {
  // Entire note revision is intentionally conservative: metadata changes invalidate stale entries too.
  return hash(
    JSON.stringify([
      note.path,
      section.id,
      note.contentHash,
      REPRESENTATION_VERSION,
      modelIdentity(config),
      embeddingInput(note, section),
    ]),
  );
}
export function normalizedVector(vector: readonly number[], dimensions: number): number[] {
  if (vector.length !== dimensions || vector.some((value) => !Number.isFinite(value)))
    throw new Error("Invalid embedding dimension or value");
  // Scale before squaring to avoid overflow/underflow in finite provider vectors.
  const max = vector.reduce((largest, value) => Math.max(largest, Math.abs(value)), 0);
  if (max === 0) throw new Error("Zero embedding vector");
  const length = Math.sqrt(vector.reduce((sum, value) => sum + (value / max) ** 2, 0));
  return vector.map((value) => value / max / length);
}
export function cosine(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length) throw new Error("Vector dimension mismatch");
  return left.reduce((sum, value, i) => sum + value * right[i]!, 0);
}

/** Includes request deadline and cancellation even if an adapter ignores its signal. */
export async function encode(
  provider: EmbeddingProvider,
  texts: readonly string[],
  signal?: AbortSignal,
): Promise<EmbeddingResponse> {
  validateEmbeddingConfig(provider.config);
  signal?.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new Error("Embedding deadline exceeded")),
    provider.config.timeoutMs,
  );
  let rejectAbort: ((reason: unknown) => void) | undefined;
  const rejectOnAbort = () => rejectAbort?.(controller.signal.reason);
  const cancelled = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  controller.signal.addEventListener("abort", rejectOnAbort, { once: true });
  try {
    const response = await Promise.race([provider.embed(texts, controller.signal), cancelled]);
    controller.signal.throwIfAborted();
    if (response.vectors.length !== texts.length) throw new Error("Incomplete embedding batch");
    if (
      (response.usage.inputTokens !== null &&
        (!Number.isFinite(response.usage.inputTokens) || response.usage.inputTokens < 0)) ||
      (response.usage.usd !== null &&
        (!Number.isFinite(response.usage.usd) || response.usage.usd < 0))
    )
      throw new Error("Invalid embedding accounting");
    return {
      ...response,
      vectors: response.vectors.map((v) => normalizedVector(v, provider.config.dimensions)),
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", rejectOnAbort);
  }
}

export class MemoryEmbeddingCache implements EmbeddingCache {
  private readonly records = new Map<string, VectorRecord>();
  get(key: string): Promise<VectorRecord | undefined> {
    const record = this.records.get(key);
    return Promise.resolve(record ? structuredClone(record) : undefined);
  }
  put(record: VectorRecord): Promise<void> {
    this.records.set(record.key, structuredClone(record));
    return Promise.resolve();
  }
  retain(keys: ReadonlySet<string>): Promise<void> {
    for (const key of this.records.keys()) if (!keys.has(key)) this.records.delete(key);
    return Promise.resolve();
  }
  get size(): number {
    return this.records.size;
  }
}

/** Host-maintained index. Agent queries cannot access rebuild or persistent cache writes. */
export class ExactVectorIndex {
  private records: VectorRecord[] = [];
  private indexedRevision: string | null = null;
  private readonly identity: string;
  private buildAccounting: IndexAccounting | null = null;
  constructor(readonly config: EmbeddingConfig) {
    this.identity = modelIdentity(config);
  }

  status(corpus: Corpus): "complete" | "stale" | "unavailable" {
    if (this.indexedRevision === null) return "unavailable";
    return this.indexedRevision === corpus.revision ? "complete" : "stale";
  }
  get size(): number {
    return this.records.length;
  }
  get lastBuild(): IndexAccounting | null {
    return this.buildAccounting ? { ...this.buildAccounting } : null;
  }
  get vectorBytes(): number {
    return this.records.length * this.config.dimensions * 8;
  }
  snapshot(): VectorRecord[] {
    return structuredClone(this.records);
  }

  /** Host-driven maintenance is atomic at index publication; failed builds remain unavailable. */
  async rebuild(
    corpus: Corpus,
    provider: EmbeddingProvider,
    cache: EmbeddingCache,
    signal?: AbortSignal,
  ): Promise<IndexAccounting> {
    if (modelIdentity(provider.config) !== this.identity)
      throw new Error("Embedding model configuration mismatch");
    this.records = [];
    this.indexedRevision = null;
    const started = performance.now();
    const revision = corpus.revision;
    const expected = corpus.paths().flatMap((path) => {
      const note = corpus.get(path)!;
      return note.sections.map((section) => ({
        note,
        section,
        key: vectorKey(note, section, this.config),
      }));
    });
    const active = new Set(expected.map((entry) => entry.key));
    const next: VectorRecord[] = [];
    const missing: typeof expected = [];
    const accounting: IndexAccounting = {
      expectedSections: expected.length,
      cachedSections: 0,
      encodedSections: 0,
      requests: 0,
      inputCharacters: 0,
      inputTokens: 0,
      usd: 0,
      elapsedMs: 0,
    };
    this.buildAccounting = accounting;
    try {
      await cache.retain(active);
      for (const entry of expected) {
        signal?.throwIfAborted();
        const cached = await cache.get(entry.key);
        if (cached) {
          this.validateRecord(cached, entry.note, entry.section);
          next.push({ ...cached, vector: normalizedVector(cached.vector, this.config.dimensions) });
          accounting.cachedSections++;
        } else missing.push(entry);
      }
      for (let i = 0; i < missing.length; i += this.config.batchSize) {
        const batch = missing.slice(i, i + this.config.batchSize);
        const inputs = batch.map(({ note, section }) => embeddingInput(note, section));
        accounting.requests++;
        accounting.inputCharacters += inputs.reduce((sum, text) => sum + text.length, 0);
        const priorTokens = accounting.inputTokens;
        const priorUsd = accounting.usd;
        // Until a response arrives, spending is unknown even if the request fails.
        accounting.inputTokens = null;
        accounting.usd = null;
        const response = await encode(provider, inputs, signal);
        accounting.inputTokens =
          priorTokens === null || response.usage.inputTokens === null
            ? null
            : priorTokens + response.usage.inputTokens;
        accounting.usd =
          priorUsd === null || response.usage.usd === null ? null : priorUsd + response.usage.usd;
        signal?.throwIfAborted();
        if (corpus.revision !== revision)
          throw new Error("Corpus changed during embedding build; retry maintenance");
        for (const [j, { note, section, key }] of batch.entries()) {
          const record: VectorRecord = {
            key,
            path: note.path,
            sectionId: section.id,
            contentHash: note.contentHash,
            representationVersion: REPRESENTATION_VERSION,
            modelIdentity: this.identity,
            input: inputs[j]!,
            vector: response.vectors[j]!,
          };
          await cache.put(record);
          next.push(record);
          accounting.encodedSections++;
        }
      }
      signal?.throwIfAborted();
      if (corpus.revision !== revision)
        throw new Error("Corpus changed during embedding build; retry maintenance");
      this.records = next.sort(
        (a, b) => a.path.localeCompare(b.path) || a.sectionId.localeCompare(b.sectionId),
      );
      this.indexedRevision = revision;
      return { ...accounting, elapsedMs: performance.now() - started };
    } finally {
      accounting.elapsedMs = performance.now() - started;
      // A note reclassified/deleted during a failed build must leave no stale cache entry.
      const currentKeys = new Set(
        corpus.paths().flatMap((path) => {
          const note = corpus.get(path)!;
          return note.sections.map((section) => vectorKey(note, section, this.config));
        }),
      );
      await cache.retain(currentKeys);
    }
  }

  search(
    corpus: Corpus,
    vector: readonly number[],
    options: CorpusSearchOptions = {},
  ): VectorHit[] {
    const state = this.status(corpus);
    if (state !== "complete")
      throw new Error(`Semantic index ${state}; rebuild outside the agent loop`);
    const query = normalizedVector(vector, this.config.dimensions);
    const counts = new Map<string, number>();
    return this.records
      .filter((record) => corpus.eligible(record.path, options))
      .map((record) => ({
        path: record.path,
        sectionId: record.sectionId,
        contentHash: record.contentHash,
        score: cosine(query, record.vector),
      }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.path.localeCompare(b.path) ||
          a.sectionId.localeCompare(b.sectionId),
      )
      .filter((hit) => {
        const count = counts.get(hit.path) ?? 0;
        counts.set(hit.path, count + 1);
        return count < (options.perNote ?? 1);
      })
      .slice(0, options.limit ?? 10);
  }
  private validateRecord(record: VectorRecord, note: ParsedNote, section: Section): void {
    if (
      record.key !== vectorKey(note, section, this.config) ||
      record.path !== note.path ||
      record.sectionId !== section.id ||
      record.contentHash !== note.contentHash ||
      record.modelIdentity !== this.identity ||
      record.representationVersion !== REPRESENTATION_VERSION ||
      record.input !== embeddingInput(note, section)
    )
      throw new Error("Embedding cache identity mismatch");
    normalizedVector(record.vector, this.config.dimensions);
  }
}

/** Section-level RRF, then note deduplication; no similarity scores are citable support. */
export function reciprocalRankFusion(
  rankings: readonly (readonly VectorHit[])[],
  limit = 10,
  constant = 60,
  perNote = 1,
  weights: readonly number[] = rankings.map(() => 1),
): VectorHit[] {
  if (
    !Number.isFinite(constant) ||
    constant <= 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    !Number.isInteger(perNote) ||
    perNote < 1 ||
    weights.length !== rankings.length ||
    weights.some((weight) => !Number.isFinite(weight) || weight <= 0)
  )
    throw new Error("Invalid RRF settings");
  const merged = new Map<string, VectorHit>();
  for (const [rankingIndex, ranking] of rankings.entries()) {
    const seen = new Set<string>();
    ranking.forEach((hit, i) => {
      const key = `${hit.path}\u0000${hit.sectionId}`;
      if (seen.has(key)) return;
      seen.add(key);
      const old = merged.get(key);
      if (old && old.contentHash !== hit.contentHash) throw new Error("RRF revision mismatch");
      merged.set(key, {
        ...hit,
        score: (old?.score ?? 0) + weights[rankingIndex]! / (constant + i + 1),
      });
    });
  }
  const counts = new Map<string, number>();
  return [...merged.values()]
    .sort(
      (a, b) =>
        b.score - a.score || a.path.localeCompare(b.path) || a.sectionId.localeCompare(b.sectionId),
    )
    .filter((hit) => {
      const count = counts.get(hit.path) ?? 0;
      counts.set(hit.path, count + 1);
      return count < perNote;
    })
    .slice(0, limit);
}
