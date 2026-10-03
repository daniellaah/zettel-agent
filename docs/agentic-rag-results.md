# Agentic RAG implementation and free validation

On 2026-10-02, the requested free implementation sequence was completed. Paid Agent/judge and live-provider E2E remain deferred under the owner's earlier instruction. The repository still has five evidence tools: `search`, `match`, `read`, `links` and `list`.

| Requested gap                      | Implemented behavior                                                                                                     | Evidence and limit                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Claim/evidence review and repair   | Optional same-model review, exact quote/scope/selector checks, one repair, second review, failed drafts withheld         | Scripted production-loop and Obsidian tests; no live semantic quality claim           |
| Paired real Agent validation       | Runnable, explicitly gated three-variant driver; zero-call preflight                                                     | 66 planned jobs; actual paid runs not dispatched                                      |
| Complex question coverage/stopping | Bounded question-part statuses, explicit disclosure of missing/conflicting parts, persisted audit and targeted retrieval | Structural default cannot infer semantic completeness; same-model review can err      |
| Long conversations                 | Complete-turn request window, unchanged full history/raw blocks, extractive archive and stale-source notices             | Conservative 64k UTF-8 byte allowance; archived bodies need new reads                 |
| Parallel retrieval                 | At most two asynchronous search preparations, ordered ledger/result delivery                                             | Tests reverse completion order, limits and cancellation; other tools remain serial    |
| Representative mechanics fixtures  | Independent long-section, Chinese, conflict, injection and changed-source cases                                          | Synthetic in-memory cases; no human review or owner-workload representativeness claim |

## Use in the plugin

`Answer checks` defaults to **Citation structure**, with no added model calls. **Evidence and coverage self-review (experimental)** opts into the same configured answer model and can add up to three billed calls inside the existing ten-request turn limit. It buffers drafts, reviews every selected answer unit, executes at most three targeted read/search actions when necessary, revises once and rechecks. Accepted answers are labeled as same-model checks, never independent verification. Failed reviews publish a short retry message and retain drafts/reviews in the saved audit.

Question coverage is local host state, not a new callable tool. Unanswered or conflicting subquestions must be explicitly disclosed. The reviewer gets actual delivered scopes, bounded source prefixes and read/search metadata; ledger membership, titles, graph edges and similarity scores cannot substitute for body support.

The full conversation remains saved. Requests omit complete older turns when necessary and add a small navigation index. That index cannot support citations or restore an omitted decision automatically. Current-source hash changes are disclosed; follow-ups can reread and receive new evidence IDs while preserving historical IDs. A current turn that cannot fit stops before provider dispatch.

## Validation

- `npm run check`: typecheck, ESLint, Prettier and 340 tests across 57 files passed.
- `npm run build`: production bundle passed.
- Targeted `npm run e2e`: six tests passed in the actual fixture Obsidian window, with normal startup restored. This covers plugin/settings, buffered review/repair, saved review recovery, failed-draft suppression, real local hybrid search, warm cache, replay and unavailable-service fallback. Answer providers were scripted; embedding calls used local Ollama. No paid API calls.
- `npm run eval:agentic-rag` in explicit `prepare` phase passed: 66 planned jobs, zero answer/judge/embedding calls, zero spending allowance. See the [final preflight protocol](../eval/reports/agentic-rag-v1/preflight-complete/protocol.json).
- The preexisting protected fixture/annotation/report/recording files were hash-audited unchanged. Frozen 318-note retrieval sources, existing evaluation v1 and local retrieval quality results remain historical evidence, not post-change answer-quality scores.

The ten historical SDK recordings still replay all their original exchanges offline, using an explicit larger input allowance because they predate context pruning and contain large signed raw blocks. Current default input limits are tested separately. Neither recordings nor frozen quality labels were rewritten to obtain passing results.

## Deferred paid phase

The new driver pairs six previously-used development tasks, four new synthetic robustness tasks and twelve previously-used test tasks across three variants: BM25 with structural checks, hybrid with structural checks, and hybrid with self-review. That is 66 jobs at one repeat. Order rotates within each pair. Optional repeats multiply the same frozen plan. Source changes during the synthetic follow-up intentionally exercise the production stale-index lexical fallback; the agent never rebuilds or writes its index.

Preparation is free and creates a fresh protocol directory:

```bash
AGENTIC_PHASE=prepare npm run eval:agentic-rag
```

Live execution requires `AGENTIC_PHASE=live`, `EVAL_ALLOW_API=1`, explicit `EVAL_AGENT_MODEL` and `EVAL_JUDGE_MODEL` JSON configurations including rates, positive `EVAL_MAX_USD`, a call allowance, configured API keys and local pinned Ollama. The answer and evaluation judge must differ; the answer self-review remains the answer model. The runtime uses shared `BudgetProvider` spending checks, saves raw exchanges/checkpoints and writes pending human-review sheets. No live run was performed in this phase. Existing `EVAL_MODE=live` alone cannot activate it.

Reports include failure counts, request/tool usage, latency, repair counts and externally judged support/citation/coverage outcomes. Paired bootstrap comparisons are descriptive and uncalibrated; null/invalid grades remain failures rather than invented scores. Previously-used tests are explicitly labeled as regression, and synthetic robustness cases are not fresh human-labeled owner work. Default promotion still needs real paired results, independent claim-extraction/label calibration and a fresh representative holdout. The earlier retrieval gains alone do not establish improved answer reliability.

See [ADR-0026](adr/0026-bounded-answer-review-context-and-search-concurrency.md) for the boundaries and tradeoffs.
