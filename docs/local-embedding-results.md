# Local embedding implementation and validation

Initial implementation on 2026-10-02 after the owner selected local Ollama + Qwen3-Embedding-0.6B. This completes a usable opt-in local hybrid feature, not retrieval-quality promotion. BM25 remains the default. Cloud embedding, paid answer/judge evaluation and paid E2E remain deferred.

## Use

Start Ollama. The agreed `qwen3-embedding:0.6b` model has been downloaded on the development machine (about 639 MB). In Obsidian **Settings → Zettel Agent → Local retrieval**, select **Local hybrid (experimental)**. Check **Local index → Refresh status**; use **Build / retry** after starting a previously unavailable service. The loopback address defaults to `http://127.0.0.1:11434`.

The plugin builds an index outside the Agent loop, caches complete chapter inputs/vectors outside the vault, restores unchanged vectors on startup and recomputes changed notes. Files are partitioned by vault under `~/Library/Caches/zettel-agent/embeddings/v1/` on macOS (OS equivalents elsewhere). Deleted or excluded sections are pruned during maintenance. Queries have a bounded memory cache; a model digest change rejects old vectors until rebuilding. Only local HTTP embed/tags routes are allowed; no remote or paid fallback exists. Stale/missing/failed indexes disclose BM25 fallback. Replay disables local requests. Agent evidence still goes to the configured answer model in live chat.

## Verification

- `npm run check`: typecheck, ESLint, Prettier and **308 tests across 50 files** passed.
- `npm run eval:ollama`: real local vectors for the unchanged 318-note/318-section fixture, 96 development queries and one Chinese integration query; all vectors are 1024-dimensional. Reports use a new directory: [model/accounting/rankings](../eval/reports/ollama-local/local-vector.json) and [unreviewed common candidate pool](../eval/reports/ollama-local/local-pool.json).
- `E2E_LOCAL_EMBEDDINGS=1 npm run e2e -- e2e/plugin.e2e.ts e2e/local-retrieval.e2e.ts`: five checks passed inside real Obsidian. The local scenario built 318 real vectors, rebuilt with 318 cache hits and zero re-encoding, executed hybrid `search` through ChatSession and its normal Agent loop, and validated `[E1]`. Replay used BM25 without local requests; a stopped/unavailable service produced explicit fallback. Settings rendered successfully. A scripted answer provider made zero cloud calls; this does not measure answer quality. The test harness restores its startup state after runs that opened the debug port.
- Production build without copying into the owner's vault; frozen fixture/report/annotation/historical artifact hashes audited separately.

The Node local run and Obsidian E2E use disposable caches under the OS temporary directory and leave learning notes unchanged. Paid/cloud model calls: **0**. Successful local embedding provider charge: **$0**; hardware/electricity are not included.

## Measurement limits

On the development machine (Apple M1 Pro), the final run encoded 318 sections in **22.71 seconds** (40 local batches, 35,356 input tokens). A warm rebuild reused all 318 vectors with zero encoding requests in **160.86 ms**. Exact cosine scan p95 was **1.48 ms**, excluding query encoding. These are fixture measurements, not owner-vault performance guarantees.

The genuine local development report records full/warm build accounting, actual input tokens supplied by Ollama, model digest, code hashes, scan latency, BM25/dense/hybrid rankings and null/unreviewed pooled labels. Index scans exclude query encoding and model loading. Timings vary with load and warm state; use the JSON report for the current measurements.

The local protocol pins candidate depth 50 per branch, up to five sections per note before section RRF (k=60), then one result per note at cutoff ten. Its fixed query instruction and model digest are recorded. This initial report predates quality review. The subsequent [quality results](local-retrieval-quality-results.md) freeze new common labels, compare three weights, select 1:2 on development and run one new query checkpoint. The feature stays opt-in experimental; default promotion still needs paired answer grounding/citation tests and completion of the final gate. See [ADR-0024](adr/0024-local-ollama-hybrid-retrieval.md).
