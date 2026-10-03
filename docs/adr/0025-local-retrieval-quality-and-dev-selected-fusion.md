# ADR-0025: Source-reviewed local retrieval and development-selected fusion

- Status: Accepted for experimental retrieval; default promotion pending
- Date: 2026-10-02
- Related: ADR-0023, ADR-0024

## Context

The owner requested the retrieval review and tuning steps in order while retaining the earlier deferral of paid Agent/judge/E2E calls. Real local Qwen3 embeddings and the plugin integration already worked, but their pooled candidates had no complete frozen relevance labels. The old evaluation labels and observed test outcomes cannot supply a fresh final checkpoint.

## Decision

1. Freeze `eval/suites/local-hybrid-v1` before inspecting development semantic quality: 96 existing development questions plus 24 Chinese questions, three RRF weight candidates, unchanged section representation/depth and a new 24-question checkpoint. Freeze hashes bind the protocol, queries and final source anchors. The checkpoint is synthetic and source-aware; reused notes/source families prevent claims of full semantic independence.
2. Review the common union of BM25, dense and every proposed hybrid top ten, adding prior positive candidates and any additional relevant sources discovered during review before label freeze. Review complete source bodies rather than excerpts. Grades mean complete support (2), needed partial support or concrete qualification (1), and unsupported topical similarity (0). Every candidate needs an explicit judgment. Missing, invalid and uncertain labels block scoring; they are never converted to zero.
3. Exclude the unsuccessful Gemma2 batch attempts and unreliable Llama3 probe from labels. Preserve their failures. The completing reviewer is Codex, reviewing sources directly. This is unblinded AI-assisted review, without independent human calibration. Exact-quote validation checks integrity, not entailment.
4. Freeze one new complete label version for all three systems before computing scores. Select weights only on development data with the predeclared gain, regression and scan-latency criteria. Compare source-family clustered uncertainty descriptively. Report denominators and excluded no-answer/partial-only cases explicitly.
5. Use BM25:dense weights **1:2** in the opt-in local hybrid port, selected by the development rule. Preserve default equal weights in the generic RRF function for existing callers. The production default remains BM25; no additional tool or remote fallback is added.
6. Run only that selected variant on the new final questions, once. Saved rankings may be rescored without model calls; redispatch and post-final tuning require a new suite version. Final labels are frozen before its quality scores. This final has paraphrase and Chinese slices but no exact-term slice: report the full final gate as unavailable, rather than pretending that absence passes it.
7. Store labels, rationale/quote receipts, rankings, model/accounting and implementation bindings in a new report directory. Keep old notes, annotations, reports and recordings unchanged. Local vectors and source review checkpoints remain in the ignored artifact directory; source-aware AI review is not replaced with manufactured human gold.

## Consequences

Development and the new checkpoint show retrieval gains over BM25, particularly for Chinese questions over English notes. The chosen hybrid does not dominate pure dense retrieval on every metric or case. Retrieval evidence does not establish better generated answers, citation completeness, bounded absence or prompt-injection resistance. Those need the deferred paired Agent/judge evaluation and independent calibration before default promotion.

Exact scanning remains comfortably below the 100 ms fixture target. This provides no reason to adopt a vector database now and no universal owner-vault performance guarantee. All model calls in this phase use local Ollama; no paid solver/judge calls are made. The actual plugin is verified with real local embeddings and a scripted answer provider in fixture-only Obsidian E2E.
