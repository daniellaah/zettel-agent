# Evaluation v1 — completed execution, provisional AI judgments

The first evaluation version is implemented and has executed its frozen plan. All 120 retrieval questions and 86 live jobs are accounted for. All 60 primary Agent tasks returned answers. One additional repeat stopped at a budget preflight and remains a failure. Execution completion does not mean answer quality passes the gate.

The frozen corpus contains 318 English notes: 137 literature and 181 permanent. No source note changed during evaluation. The expanded suite froze before model calls, with 96/24 retrieval and 48/12 Agent development/test items. Test primary source families are isolated; generic concepts can overlap. Dataset labels are AI-authored and AI-reviewed, with zero independent human labels.

## Completion and grading provenance

| Component                 | Completed work                                                                              | Qualification                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Retrieval                 | 120 questions, 1,000 explicit query-note labels                                             | 781 top-ten candidates remain unjudged; provisional metrics             |
| Agent                     | 60 primary live tasks                                                                       | 48 development, 12 source-family-separated test tasks                   |
| Semantic citation judging | Every answer unit and citation occurrence selected; support restricted to actual deliveries | Structural validation cannot prove entailment                           |
| Judge review              | Original independent-model round retained; replacement indexed round covers all 86 jobs     | 63 valid replacement model grades + 23 disclosed Codex repairs          |
| Calibration               | Six earlier pilot answers reviewed, plus 23 invalid expanded judgments adjudicated          | AI-only, unblinded; independent human calibration remains incomplete    |
| Comparisons               | Six predeclared items across Agent, fixed retrieval and no-vault; six extra Agent repeats   | Same solver model, small descriptive sample; retain failed repeat       |
| Robustness                | Eight separate live in-memory adversarial cases, seven interface invariants                 | No learning-corpus edits; observed resistance is not universal immunity |
| Reproducibility           | Exact offline solver/grader replay and immutable recordings                                 | 85 complete solver replays; failed dispatch has a replayed prefix only  |

Solver: `deepseek-flash`. The original `claude-sonnet-5-5` judge produced 20 valid grades before insufficient credit and budget limits stopped that round. The disclosed replacement judge is `deepseek-flash`, so solver and judge are correlated. Its original 63 valid and 23 invalid outputs remain untouched. Codex repaired schema/selectors and reviewed selected source classifications and grounding scope in the 23 invalid outputs, using only already delivered evidence. Unreviewed model semantic decisions are retained. These repairs are not 23 independent human judgments or a fresh blind adjudication of all claims.

A grader extractor bug omitted final search-excerpt body paragraphs adjacent to closing note tags from its selectable quote pool. The full body was already delivered to the Agent and was present in the judge's actual-delivery input. The fix appends missing exact paragraphs without shifting legacy quote indices. A regression test covers it. Offline replay validates the original frozen quote pools against actual deliveries before reproducing the old judgments; neither answers nor frozen test rubrics were changed.

## Results

Retrieval over declared labels: **R@10 87.0%, MRR@10 82.2%** overall; test **R@10 84.7%, MRR@10 69.8%**. These are provisional because unjudged candidates receive zero gain. The three lexical modes return identical metrics on this English corpus. [Detailed retrieval report](retrieval-expanded.md).

The following are macro averages across each primary stage. Grounding is paragraph/bullet-unit conjunctive credit, including uncited factual extras. Citation precision assesses the actually cited pairs; a high value can coexist with low grounding when many assertions have no citation. The strict gate requires complete key-point coverage, fully supported note claims, perfect citation precision, no forbidden assertions and an acceptable stop/abstention.

| Stage                    | Primary tasks | Key-point coverage | Note grounding | Citation precision | Strict passes | Solver median / p95 |
| ------------------------ | ------------: | -----------------: | -------------: | -----------------: | ------------: | ------------------: |
| Development              |            48 |              99.5% |          67.7% |              98.3% |          7/48 |     11.48s / 21.27s |
| Held-out source families |            12 |             100.0% |          53.6% |              97.6% |          1/12 |      9.12s / 13.11s |
| Robustness               |             8 |             100.0% |          50.0% |             100.0% |           2/8 |       3.86s / 5.69s |

The main observed gap is attribution discipline: factual opening summaries, graph descriptions, and proposed connections sometimes lack citations or exceed what their cited notes say. Examples include treating zero backlinks as an orphan despite an outgoing source link, and extending a note's limited absence statement into a vault-wide claim. Correct answers and valid evidence IDs alone do not establish grounding. A next improvement should target these development failures, then use new unseen evaluation material rather than tune against this test set.

All eight robustness answers cover the declared core points with zero scored forbidden violations; only two satisfy the full grounding gate. This separates attack-trigger checks from overall answer quality.

| Six paired development items | Strict passes | Solver median | Estimated solver usage cost |
| ---------------------------- | ------------: | ------------: | --------------------------: |
| Agent loop                   |           1/6 |        14.10s |                     $0.0357 |
| Fixed top-five retrieval     |           0/6 |         3.96s |                     $0.0096 |
| No vault                     |           0/6 |         4.49s |                     $0.0049 |

Across two Agent trials on these six items, first-trial and any-trial strict success are both 1/6; all-trial success is 0/6. One second trial stopped at the budget preflight and stays in the denominator. These results do not establish statistical superiority. No-vault questions concern the owner's notes, so they cannot earn source-grounding credit without delivered evidence.

## Spending

All earlier independent grades, discarded format repairs, interrupted calls and replacement phases remain in the accounting. A selected final grading-round summary alone would understate total spending. Inherited answers are counted only once.

| Live phase                                      | Returned-usage estimate | Unknown-usage reservation retained |
| ----------------------------------------------- | ----------------------: | ---------------------------------: |
| 2026-10-02T20-00-14-191Z-full-live              |               $3.177150 |                          $1.468585 |
| 2026-10-02T20-13-23-621Z-full-continuation-live |               $0.193546 |                          $0.062004 |
| 2026-10-02T20-21-26-032Z-full-indexed-live      |               $0.613009 |                          $0.000000 |
| 2026-10-02T20-32-28-856Z-full-finish-live       |               $0.034137 |                          $0.000000 |
| 2026-10-02T20-37-33-540Z-full-finish-live       |               $0.184322 |                          $0.000000 |

The expanded headless phases total **$4.2022 known usage**, plus **$1.5306 retained unknown-usage reservations**. Including the previous pilot/regrades and recorded E2E scenes, recorded known usage is **$6.1758**, or **$9.7055 with retained reservations**. Auxiliary UI API calls were not fully metered and are excluded. These are configured-price estimates, not provider invoices or a guaranteed billing ceiling. Reservations for credit errors or interrupted calls are retained rather than presumed free.

AI adjudication, offline retrieval, strict replay and smoke verification add zero model API calls. No further live call is required to read or replay this report.

## Verification and artifacts

- `npm run check`: 248 tests across 37 files, plus typecheck, ESLint and Prettier.
- Paid Obsidian E2E: 33/33 passed in the recorded fixture run; runtime behavior has not changed since that run. [E2E report](../../e2e/reports/2026-10-02T20-04-04-752Z-deepseek.json).
- `npm run eval`: all 120 frozen retrieval cases validated, zero APIs.
- `EVAL_MODE=smoke EVAL_ALLOW_API=0 npm run eval:full`: all 86 planned jobs exercise the mechanics, zero APIs; smoke scores are not model-quality results.
- `eval:full-replay`: 85 complete solver replays, one failed-dispatch prefix; all 63 valid and 23 invalid original judge outputs reproduced, zero APIs.
- `eval:ai-recover`: 23 reviewed AI records, zero pending, 86/86 resulting judgments validated, zero APIs.

[Machine-readable summary](evaluation-v1.json) includes hashes, stage denominators, phase costs and limitations. Detailed immutable execution: [raw report](../artifacts/2026-10-02T20-37-33-540Z-full-finish-live/report.json), [AI recovery report](../artifacts/2026-10-02T20-37-33-540Z-full-finish-live/ai-recovery/report.json), [strict replay](../artifacts/2026-10-02T20-37-33-540Z-full-finish-live/strict-replay.json).

```bash
# Free checks
npm run eval
EVAL_MODE=smoke EVAL_ALLOW_API=0 npm run eval:full
EVAL_FULL_REPLAY_DIR=eval/artifacts/2026-10-02T20-37-33-540Z-full-finish-live npm run eval:full-replay
EVAL_AI_REVIEW_DIR=eval/artifacts/2026-10-02T20-37-33-540Z-full-finish-live/ai-recovery npm run eval:ai-recover
```

The first evaluation execution is complete. Independent human calibration, full independent-model judging, exhaustive retrieval labels and a statistically powered model comparison remain separate research work, not completed claims of this version.
