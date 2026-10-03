# Local retrieval quality, tuning and final checkpoint

Completed the free retrieval review and development selection on 2026-10-02. The opt-in hybrid now uses BM25:dense RRF weights **1:2**. BM25 remains the default. The paid paired Agent/judge evaluation remains deferred by the owner; no answer-quality or default-promotion claim is made.

## Protocol and labels

The [frozen protocol](../eval/suites/local-hybrid-v1/protocol.json) and query hashes were created before inspecting development semantic quality. The unchanged fixture has 318 notes/sections, with Qwen3-Embedding-0.6B, 1024 dimensions, L2-normalized cosine and the pinned `research-query-v1` instruction/model digest. Both branches nominate 50 sections, permitting five per note; section RRF uses k=60, then one result per note at cutoff ten. Development compares weights 1:1, 1:0.5 and 1:2 on identical cached query vectors, filters and common labels.

Development contains 120 questions: the original 96 development questions and 24 new Chinese questions. Direct source review covers **1,886 query-note assignments across 308 unique full bodies**. The final pool covers **339 assignments across 145 full bodies**. One additionally relevant source was added to each pool during review, before label freezing/scoring. This is a reviewed candidate-union measure, not exhaustive corpus-wide recall.

The initial local Gemma2 judge repeatedly omitted IDs or misgraded direct evidence; a Llama3 probe also confused complete and partial support. Neither supplied accepted labels. Failed outputs remain in the ignored artifacts. Codex then read the complete bodies and reviewed every candidate against its question, recording grades, rationales and positive exact body quotes. Review is **AI-assisted, source-aware and unblinded**, with no independent human calibration. Grade 2 alone answers the complete question; grade 1 supplies needed partial support or a concrete qualification. Mere shared terminology is grade 0. Source/pool/schema/quote checks validate identity and completeness, not semantic entailment.

The new [development labels](../eval/reports/local-hybrid-quality-v1/dev-labels.json) and [review receipt](../eval/reports/local-hybrid-quality-v1/dev-review.json) were frozen before development scoring. All compared systems have zero unjudged top-ten candidates. The eight owner-specific no-answer questions have no positive documents and are excluded from recall/MRR, rather than scored as successes. R@10 measures any positive grade over **112** questions; MRR@10 requires a complete grade-2 answer over **110** questions. Two composition questions have only partial supports and no MRR denominator. Retrieval scores do not validate absence-handling by an Agent.

## Development selection

| Retriever / weights |       R@10 |     MRR@10 |
| ------------------- | ---------: | ---------: |
| BM25                |     76.30% |     77.42% |
| Dense               |     93.32% |     93.52% |
| Hybrid 1:1          |     93.04% |     91.55% |
| Hybrid 1:0.5        |     90.88% |     89.88% |
| **Hybrid 1:2**      | **94.16%** | **92.91%** |

The frozen selection rule chooses passing variants by R@10, then MRR, with baseline winning ties. All three hybrid variants pass the development numerical gain/regression and scan-latency criteria; **1:2** wins. Its exact-term slice has R@10 **92.31%** versus BM25 **86.22%** (52 questions), and MRR **92.81%** versus **87.42%** (51 complete-answer questions). The 24 Chinese questions have R@10 **95.49%** versus BM25 **40.28%**, and MRR **91.11%** versus **37.50%**. Twelve of these Chinese questions retain exact technical terms; twelve omit them and form the cross-language slice.

Compared with 1:1, 1:2 improves full-answer order for LoRA's Chinese rank question, KV sharing, DPO updates and orchestration autonomy, while bringing numerical-parity and R1 reward qualifications into the top ten. It also regresses individual cases: LoRA initialization (`r021`) and attention recomputation (`r030`) move the complete answer from rank 1 to rank 2; ADC (`zh13`) falls from rank 2 to rank 3. No tokenizer, encoder, representation or final-dependent weight change was made to hide those errors.

The development paired source-family bootstrap gives descriptive 95% intervals of **+13.69 to +21.83 percentage points** for R@10 gain over BM25 and **+9.44 to +21.07 points** for MRR gain. This reflects sampling across source families, not calibrated AI-label uncertainty. See the [full development report](../eval/reports/local-hybrid-quality-v1/dev-quality.json) and [frozen selection](../eval/reports/local-hybrid-quality-v1/selection.json).

## One final checkpoint

The 24 fresh question phrasings were frozen before development-score inspection: 12 English paraphrases and 12 Chinese questions from six families. Notes and some concepts/source families are reused; cross-validation is already represented in the old development suite. This is fresh query/outcome evidence, **not** unseen sources, independent human gold or a blind real-user test. Final source labels were frozen before score inspection, and no final-driven tuning occurred.

| Retriever               |       R@10 |     MRR@10 |
| ----------------------- | ---------: | ---------: |
| BM25                    |     32.50% |     32.71% |
| Dense                   |     88.06% |     78.03% |
| **Selected hybrid 1:2** | **82.64%** | **82.08%** |

All 24 questions enter both denominators. On the 12 English questions, hybrid scores **80.56% / 82.22%**, versus BM25 **65.00% / 65.42%**. On the 12 Chinese questions, hybrid scores **84.72% / 81.94%**, versus BM25 **0% / 0%** over these English-only notes. Hybrid improves first complete-answer placement over pure dense while losing some relevant-document coverage. This result was reported without switching the chosen configuration.

Six-family descriptive paired bootstrap intervals for hybrid minus BM25 are **+33.33 to +66.81 points** R@10 and **+35.83 to +61.67 points** MRR. The small synthetic sample and correlated AI labels limit these intervals. The final has **no exact-term slice**, so the complete final promotion gate is **unavailable**, not passed. Development supplies the exact-term regression check; full promotion still needs the deferred answer evaluation. See [final labels](../eval/reports/local-hybrid-quality-v1/final-labels.json), [review receipt](../eval/reports/local-hybrid-quality-v1/final-review.json) and [final scores](../eval/reports/local-hybrid-quality-v1/final-quality.json).

## Local performance and verification

On Apple M1 Pro, the selected final run restored all 318 cached sections in **108.67 ms**, with no section re-encoding. It made 24 single-query embedding requests, reporting 1,025 input tokens and **$0 provider charges**. Query encoding median was **33.83 ms**, p95 **60.75 ms**, with a first-query maximum **3,108.95 ms** including local model startup. Scan/filter p95 was **4.86 ms**, excluding query encoding, model-identity HTTP checks and UI rendering. Startup is visible rather than removed from the distribution. Hardware/electricity costs are not included.

This phase’s full development build measured **27.60 seconds**, 40 local batches and 35,356 input tokens. The earlier full build measured 22.71 seconds with the same batch/token counts; those historical measurements remain in [local embedding results](local-embedding-results.md). A cache plus exact scanning remains appropriate; no vector database is justified by this fixture workload. Larger vaults still require representative measurements.

- `npm run check`: typecheck, lint, format and 314 tests across 52 files pass.
- Fixture-only local E2E uses real Ollama embeddings and a scripted answer provider, covering the normal ChatSession/Agent tool/citation path, warm cache, Replay and explicit fallback. It makes zero cloud calls; **five checks passed**, with zero cloud calls. The first macOS launch failed and the retry passed; normal startup was restored.
- **2,554** frozen original notes, reports, annotations and historical artifacts passed the SHA-256 audit unchanged. The owner's vault is not used.

[Identity/accounting manifest](../eval/reports/local-hybrid-quality-v1/identity.json) records hardware, model, implementation, suite, label and ranking bindings. Raw rankings are saved in the same versioned report directory; embedding vectors and full source-review inputs remain in `eval/artifacts/local-hybrid-quality-v1` (ignored, no credentials).

## Reproduction and next authorized boundary

For a new experiment version, prepare local vectors/pools with `EVAL_LOCAL_STAGE=prepare npm run eval:local-quality`. Review complete sources, write the validated source-review checkpoint, and use `EVAL_LOCAL_STAGE=score` to freeze development labels and select weights. Existing frozen development labels block overwriting preparation. The abandoned `review` stages retain the local-judge experiment and fail on incomplete output; they are not an accepted labeling shortcut.

`EVAL_LOCAL_STAGE=final` dispatches only the development-selected configuration, once. `EVAL_LOCAL_STAGE=score-final` reuses its saved vectors/rankings and validated complete source review, without model calls. Frozen labels must match exactly on any scoring replay. A second final dispatch requires a new frozen suite. New suite hashes must not be regenerated to conceal edits.

The remaining step is a separately configured/allowed paired Agent and judge run covering answer correctness, delivered-evidence grounding, citation recall/precision, no-answer handling, robustness, tokens, cost and latency. It stays deferred under the owner's earlier instruction. Keep experimental opt-in and BM25 default until that evidence and the missing final gate are resolved.
