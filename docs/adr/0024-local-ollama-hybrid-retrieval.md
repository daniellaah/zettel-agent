# ADR-0024: Opt-in local Ollama hybrid retrieval

Status: accepted, 2026-10-02. Extends ADR-0023 after the owner selected local Qwen embeddings and requested implementation. Paid Agent/judge/cloud embedding work remains deferred.

## Decision

Offer **Local hybrid (experimental)** alongside the default BM25 mode. Integration as an explicit experimental option does not claim that ADR-0023's quality gates passed; reviewed common pools, paired answer evaluation and a fresh final checkpoint remain necessary before changing the default or claiming improved retrieval quality.

Use Ollama's `qwen3-embedding:0.6b`, 1024-dimensional normalized vectors and cosine similarity. Pin the installed full model digest, not just a mutable tag. The cache identity includes a fixed English research retrieval query instruction version. Documents retain `title-heading-body-v1`; queries prepend the fixed instruction. Both use the same model. Request complete input with `truncate: false`; never silently slice input or switch models. Set the model context to 32768 and use batches of eight with a 120-second request deadline. Successful local usage records Ollama's token count and zero provider charge (hardware/electricity are not measured).

Only HTTP loopback origins are accepted. Node HTTP in the desktop host avoids Electron CORS, accepts only `/api/tags` and `/api/embed`, rejects redirects, caps response bytes and destroys the socket on cancellation. Installed model identity is checked before using even a cached query vector. Missing/changed models, stale indexes and service failures cause a disclosed BM25 fallback. Aborted queries stop the turn and close all pending tool calls in the transcript.

Index construction is plugin lifecycle maintenance, triggered by enabling local hybrid, layout readiness, changes to corpus/configuration or the settings Build/retry action. It is debounced, cancellable and serialized; no Agent tool can initiate rebuild. Cache operations remain outside the canonical vault tree, partitioned by vault root under the OS cache directory. Plain retrieval depends only on the cache interface. Query execution writes only a bounded in-memory cache of at most 128 query vectors. Replay disables all local model requests and maintenance, preserving the network-free guarantee.

Merge the top 50 BM25 and dense section candidates with section-level RRF (k=60), then apply the requested per-note and output limits. Each branch admits up to five sections per note before fusion. Hybrid candidate counts are lower bounds for the bounded candidate pool, never exact relevant-note totals. Rank scores and semantic proximity do not establish evidence. Reuse the bounded transactional tool renderer to deliver exact excerpts and provenance; semantic-only candidates have no fabricated matched keywords. Search schemas and the five-tool registry remain unchanged.

## Validation and limits

Unit tests cover loopback isolation, model identity, vector validation, query caching and filters, revision fallback, evidence budgets, cancellation, persistent-cache reuse and Replay. `eval:ollama` builds genuine vectors from the unchanged fixture and evaluates development rankings only. It saves a new unreviewed union pool; no relevance labels or semantic quality scores are invented. Local E2E drives the real Obsidian bundle with real Ollama and a scripted answer provider, without paid calls or learning-note changes. See [local embedding results](../local-embedding-results.md).

Official references: [Qwen model and query instructions](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B), [Ollama embed API](https://docs.ollama.com/api/embed).
