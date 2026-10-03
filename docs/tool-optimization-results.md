# Tool optimization execution report

This report records the first free implementation phase. The subsequent owner-requested local Ollama integration is documented in [local embedding results](local-embedding-results.md); BM25 remains the default and local hybrid is opt-in experimental.

Free implementation and offline mechanics completed on 2026-10-02. The owner explicitly deferred paid embedding, Agent/judge and E2E phases. Production search remains lexical; semantic quality and answer-quality improvement are unmeasured.

## Milestones

| Milestone | Result                                                                                                                                                                                                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0        | Clean initial working tree; 248 baseline tests passed. Read architecture/required ADRs, audited ignored credential-file names and owner-only permissions without printing values, inventoried frozen files.                                                                         |
| M1: T1–T3 | Versioned readable tool results with per-delivery scopes; bounded body/outline reading and safe stale-reference behavior; correct directed graph counts, connection states and paginated one/two-hop neighbors.                                                                     |
| M2: T4–T5 | Stable filtered list/match pagination, bounded regex subset, consistent empty-stage filters, multi-section lexical interface, prompt guidance, attachment/transcript provenance and output-budget enforcement.                                                                      |
| M3        | Offline embedding-provider/cache abstraction, exact cosine index, incremental invalidation, RRF comparison, pool-review guards and clustered paired uncertainty. Fake-vector/cache benchmarks passed. Genuine vectors, reviewed semantic pools and quality comparisons are pending. |
| M4        | Production semantic/hybrid integration deferred: no quality gate has passed. The synchronous Agent tools continue to work without embedding requests.                                                                                                                               |
| M5        | Keep exact scanning and the host-managed cache. Measured workloads are below the predeclared 100 ms scan p95 target. No vector database/ANN dependency introduced.                                                                                                                  |
| M6        | Keep the five evidence tools. Historical development traces do not justify adding an in-memory planning tool.                                                                                                                                                                       |

Contract and pagination choices are in [ADR-0022](adr/0022-bounded-tools-and-delivery-provenance.md); embedding/cache/fusion/gate choices are in [ADR-0023](adr/0023-offline-vectors-cache-and-hybrid-gate.md).

## Tool behavior and boundary verification

Each successful or failed result reports accessible research scope, effective inputs, revision, units/count semantics and completeness. Successful spans record exact escaped text and section/revision identity for title, metadata, outline, preview, excerpt, body, matched-line or graph exposure. Evaluators use these delivered spans rather than expanding source text as hidden support. Historical trace/cassette parsing is retained without editing recorded requests.

Read pages reconstruct oversized and many-section bodies without gaps or duplicated source spans. Deleted sections never expand into unrelated whole-note content. Outlines and exact section IDs resolve repeated headings, while surviving edited sections get new revision IDs. New copied citations retain exact vault-relative path identity even if duplicate basenames appear later. Cursors are opaque, query/revision-bound and expire after reload or bounded registry eviction. Restart a query after any index change.

Graph self-links count as resolved incoming/outgoing edges but do not create self-neighbors. No-backlinks/no-outlinks differ from orphan, and a literature-only outgoing link prevents orphan status. Neighbor filters select endpoints; counts and traversal cover the complete accessible graph. Two-hop neighbors are labeled as distance two and never presented as direct semantic agreement.

Literal matching remains available. Regex intentionally accepts only a fixed-width subset (classes, dot, anchors, elementary escapes and literals); groups, alternation, quantifiers and backreferences return recoverable errors before execution. Context is bounded to three lines each side; displayed line clipping is reported. All filters exclude fleeting and outside-corpus paths. Metadata, attributes, wrapper closures and selected text remain untrusted data.

Output caps include contract summaries, wrappers and metadata. Evidence registration is transactional: an over-budget result registers no IDs. Attached-note tool output counts against the same turn allowance. Reading a new body span for an existing ID counts as investigation progress; repeating the same span does not.

## Offline measurements and their limits

Hardware: Apple M1 Pro, arm64 macOS, 8 logical CPUs, 16 GiB RAM, Node v24.9.0. Model identifier: `offline-test/pseudorandom-mechanics-only`, version 1, 1536 dimensions. This is a deterministic test-vector generator, not a semantic model. Representation: `title-heading-body-v1`. Cost: zero real model API calls; zero provider spending. Real encoder token counts and prices are unavailable; 204,993 input characters are measured for full fixture indexing and cannot be substituted for a chosen provider's token count.

Latest benchmark results are in [vector-mechanics.json](../eval/reports/tool-v2/vector-mechanics.json). The benchmark separates fake full encoding, persisted-cache reads, cached query lookup and scanning. Its cached query timing is not actual local/network encoder latency.

| Workload             | Notes / sections | Vector payload   | Full fake build           | Cached rebuild                    | Scan p50 / p95  |
| -------------------- | ---------------- | ---------------- | ------------------------- | --------------------------------- | --------------- |
| Frozen fixture       | 318 / 318        | 3,907,584 bytes  | 830 ms; 5 logical batches | 212 ms; 318 cache hits, 0 batches | 0.94 / 8.58 ms  |
| Synthetic 10x copies | 3,180 / 3,180    | 39,075,840 bytes | 846 ms in-memory build    | Not measured                      | 8.08 / 20.35 ms |

The first invocation under concurrent check load measured scan p95 of 17.91 ms for the fixture and 31.62 ms for synthetic 10x; a later invocation measured 6.22 / 8.69 ms respectively, and the final implementation-binding run measured the table above. These are descriptive host measurements, not universal thresholds. The 10x workload alternates unfiltered scanning and a one-copy folder filter, 30 trials, top ten. Payload estimates exclude JavaScript object/string overhead; process RSS in the JSON includes the whole benchmark and both indexes. The frozen fixture is representative of the current evaluation corpus, while copies are a mechanics stress test rather than a representative owner vault. No real vault was read or modified.

The offline comparison exercises all 96 development queries, six repeated query-cache inputs and one independent synthetic cross-language mechanics input. Six repeat inputs hit the query cache. BM25/dense/hybrid candidate depth is 50, cutoff ten, RRF constant 60, then best-section note deduplication. [fake-vector-pool.json](../eval/reports/tool-v2/fake-vector-pool.json) has null/unreviewed labels and is explicitly unsuitable for semantic quality grading. No semantic Recall/MRR or Agent answer-quality score is reported. Genuine pooled labels must be frozen as a new version before comparisons; unjudged candidates are not verified negatives.

Default lexical rankings for all 120 frozen regression queries and all tokenizer modes exactly match the preserved v1 report. New reports are [retrieval-expanded.json](../eval/reports/tool-v2/retrieval-expanded.json) and [retrieval-expanded.md](../eval/reports/tool-v2/retrieval-expanded.md). The observed v1 test set is used only for regression, not a fresh blind quality claim. All 318 fixture notes currently parse into one section each, so the development multi-section comparison cannot establish a benefit from `per_note > 1`. Synthetic unit fixtures verify relevant multi-section coverage and both caps. Per-query output-character comparisons are recorded in the vector report; no model token/quality benefit is inferred.

## Database and planning decisions

Keep the local cache and exact scan. Revisit when a representative workload exceeds 100 ms scan/filter p95 or an explicitly chosen memory budget, durable incremental maintenance becomes inadequate, or product requirements include shared/concurrent/synchronized collections. Measure real chosen dimensions and encoder latency separately, then benchmark an embedded index against exact neighbors before choosing a service or introducing packaging changes. Current measurements do not trigger that work.

The [historical development trace audit](../eval/reports/tool-v2/planning-trace-review.json) inspected 48 immutable primary development runs: 419 tool calls, zero repeated exact name/input calls, maximum 19 calls in a run. This is a mechanical review, not proof that no subgoal was lost. It supplies no observed repetition problem that justifies a sixth planning tool. No held-out trace informed this decision.

## Validation and pending paid work

Run from the repository:

```bash
npm run check
EVAL_SUITE=expanded EVAL_REPORT_DIR=eval/reports/tool-v2 npm run eval
EVAL_MODE=smoke EVAL_ALLOW_API=0 npm run eval:full
EVAL_REPORT_DIR=eval/reports/tool-v2 npm run eval:vector
env -u OBSIDIAN_PLUGIN_DIR npm run build
```

Checks passed after each implementation batch. Final `npm run check` passed typecheck, ESLint, Prettier and all 295 unit/regression tests across 45 files (248 baseline tests, 47 added). The final expanded scripted smoke (`eval/artifacts/2026-10-02T23-45-44-850Z-full-smoke`) completed 86/86 jobs with zero model API calls; it measures mechanics, not answer quality. Production bundling passed without copying the plugin into any vault. A final SHA-256 audit verified all 2554 inventoried frozen corpus, v1 report/annotation, historical failure, review and recording files unchanged. No commits or vault-note changes were made.

Full `npm run e2e` remains unrun for this implementation because it restarts Obsidian on the fixture and calls paid live APIs, which the owner explicitly deferred. Historical E2E success does not verify the new schema/prompt. Strict v1 paid-evaluation requests intentionally cannot replay the changed production prompt/contract; do not rewrite old cassettes to make them match. Existing SDK cassette parsing regressions still run offline. Capture new versioned cassettes when paid work resumes.

The future [development protocol](../eval/reports/tool-v2/development-protocol.json) predeclares 12 development tasks (`a01`–`a12`) and the six paired/repeat tasks before new solver quality results. Before that phase, resolve explicit embedding/Agent/judge models, current rates, dollar allowance and maximum requests. Maintain separate indexing, query, solver, judge and E2E ledgers, including unknown-usage reservations. Freeze a new unseen final checkpoint; v1 test answers are observed. Review genuine union candidates and use one common versioned label set. Retrieval needs at least +3 percentage points in R@10 or MRR@10, at most −2 points in the other metric and no major exact-term regression; report source-family uncertainty and denominators. Paired answer grounding, citation coverage, tokens, costs, latency and a fresh final checkpoint must also support promotion. Real semantic results and production integration remain pending those gates.
