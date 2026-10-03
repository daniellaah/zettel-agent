# Evaluation

Current implementation: a frozen 318-note learning corpus (137 literature, 181 permanent), **120 retrieval queries and 60 answer tasks**. All learning notes and questions are English. Expanded annotations are explicitly AI-reviewed; independent human calibration has not been performed. The original 20-query/12-task pilot and its recordings remain unchanged.

The expanded suite separates 96 development/24 test retrieval questions and 48 development/12 test answer tasks by source work and question family. Its [freeze record](suites/expanded/freeze.json) binds all annotation bytes before live scoring. The [expanded retrieval report](reports/retrieval-expanded.md) reports provisional metrics and unjudged candidate counts. These are synthetic questions and AI labels, not blind human gold.

The [completed evaluation v1 report](reports/evaluation-v1.md) accounts for all 86 live jobs. It distinguishes 63 valid replacement model grades, 23 disclosed AI adjudications and one failed repeated solver. It also records cost/latency comparisons and strict offline replay. Independent human calibration and full independent-model grading remain incomplete; current semantic scores are provisional.

```bash
npm run check       # corpus integrity, unit tests, types, lint and formatting; free
npm run eval        # all 120 retrieval questions; free
npm run eval:agent  # 48 development tasks through the production loop; free smoke default
npm run eval:full   # complete 86-job plan; free smoke default
```

The full plan contains 60 baseline Agent tasks, six repeated Agent tasks, six fixed-retrieval and six no-vault comparator tasks, and eight separate robustness tasks. Live mode requires explicit opt-in, models/rates and an approved allowance. Exact deliveries, failures, recordings, structured semantic grades, paired comparisons and first/any/all-trial reliability are saved under ignored `eval/artifacts/`. See the [operator guide](agent-evaluation.md) and [ADR-0020](../docs/adr/0020-frozen-expanded-evaluation-and-isolated-comparisons.md).

AI adjudication of six earlier pilot answers is documented in [ai-calibration.md](ai-calibration.md). Those decisions informed the revised judge rules; they are not human approvals. The ordinary human calibration command remains available and rejects incomplete or stale human reviews.

## Artifacts

| File                              | Purpose                                                                                                                    |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `corpus-manifest.json`            | Exact SHA-256 hashes, paths and stages for all 318 notes, corpus identity, and source-audit hash                           |
| `retrieval.json`                  | 20 queries and 410 explicit query-note relevance judgments with rationales and supporting excerpts                         |
| `answers.json`                    | 12 questions with answerability, claim-level support alternatives, forbidden conclusions, setup questions and graph checks |
| `schema.ts`                       | Strict runtime schemas for these artifacts                                                                                 |
| `validate.ts`                     | Snapshot, source identity, note schema, links, excerpts, support references and question-family split validation           |
| `reports/retrieval-baseline.md`   | Readable summary, denominators, misses and no-answer candidate examples                                                    |
| `reports/retrieval-baseline.json` | Full rankings, metrics, implementation/data hashes and run configuration                                                   |

The manifest binds raw UTF-8 content with SHA-256, separately from the runtime's evidence content hashes. The aggregate digest sorts paths with English collation and hashes `path + NUL + stage + NUL + sha256 + newline` for each note. The corpus ID is `learning-v1-` plus the first twelve digest characters. These are integrity records, not locks on the filesystem: changes fail validation until a deliberately reviewed new corpus version is established. Never regenerate the manifest to conceal an unintended change.

The [source audit](../fixtures/technical-note-audit.json) records the authoritative works and passages underlying the technical notes. Gold answers describe what the frozen notes support. A permanent-note inference must not be attributed to the paper as if it were an original reported result. Evaluation metadata stays outside the learning vault. The agent has no write path.

## Retrieval annotations and metrics

Each dataset has `schema`, `corpusId`, `review` and `items`. An item has an ID, question family, split, origin, English query, kind, answerability, pooling configuration, judgments and explanatory notes. Each judgment maps a vault-relative note path to a grade, rationale and exact body excerpts:

- **2:** the record independently supports a sufficient answer to the query.
- **1:** the record supplies a relevant premise, qualification or part of the answer.
- **0:** a reviewed candidate does not supply a needed answer component.
- **Absent:** unjudged, not an established negative.

The pilot has four queries per kind: lookup, paraphrase, synthesis, distinction and no-answer. Candidate pooling takes the union of the top twenty from `words`, `bigrams` and `both`, then adds known supporting notes even when retrieval misses them. Original pilot top-ten results are all judged. Expanded queries have explicitly reviewed positives and unrelated controls; many other top-ten candidates remain unjudged. Pooling only the current lexical implementation is a limitation: future retrievers can expose additional relevant notes. Review those without relabeling existing failures merely to improve scores.

Metrics use distinct notes, not sections:

- Recall@5 and Recall@10 count grades 1 and 2 and divide by the number of known positive notes.
- MRR@10 uses the first grade-2 note. A query with positive but exclusively partial evidence has no MRR measurement; one with a sufficient record missed at ten has MRR zero.
- nDCG@10 uses **linear gain equal to the relevance grade**, with an ideal ordering of known positives.
- Unknown candidates provisionally have zero gain, and `unjudged10` makes that uncertainty visible.

In the preserved pilot, sixteen answerable queries enter Recall and nDCG averages and fifteen enter MRR. In the expanded suite, 112 answerable queries enter Recall/nDCG and 111 enter MRR. The eight expanded no-answer questions have no positive denominator, so their scores are null and excluded from these averages. Their returned candidates are shown separately. Lexical matches to missing owner measurements are not, by themselves, retrieval errors; the agent must avoid inventing the requested fact.

Report results by kind and split. All original pilot items are **dev**. The expanded suite adds 24 retrieval test questions and 12 Agent test tasks from isolated primary source works. English-only results do not evaluate CJK behavior or establish which tokenizer is superior. Do not tune retrieval until the annotations are reviewed.

## Answer rubrics

The original twelve items cover three lookups, three syntheses, two follow-ups, provenance tracing, a link suggestion, a partial answer and a no-answer case. Every item records supported key points and forbidden claims rather than a single exact reference answer.

Each entry in `evidence` contains a note path, an exact excerpt and a basis:

- `literature-paraphrase`: source-faithful content in a literature note.
- `permanent-inference`: the reasoning recorded in a permanent note.
- `metadata`: bibliographic or graph provenance, not proof of a body claim.

A key point's **`supportSets` is a list of alternative sufficient evidence sets**. All entries inside one set are jointly needed; any one complete set can support the point. For example, `[["comparison"], ["optimizer", "cache"]]` accepts either the comparison note or the two underlying literature records together. IDs here are annotation-local names, not runtime `[E#]` IDs. Other genuinely sufficient evidence remains acceptable after review; do not penalize a valid answer solely for a different supporting path.

An empty `supportSets` is allowed for the absent part of a partial/no-answer rubric, such as a missing owner service measurement. Such absence is a corpus-level annotation, not a claim proven by a single retrieved passage. Related background may be cited if clearly distinguished from the missing fact. Do not fabricate owner experiences, hardware, configuration or deployment outcomes.

`history` holds prior user questions executed before the final question. It does not supply fabricated assistant answers. `activeNote` identifies the open-note context without implicitly reading or attaching its body, matching the plugin. Graph checks validate provenance edges or the absence of a direct link; they do not force a tool sequence. Independent trials reset histories and ledgers.

The original six live development answers remain available with judge-only regrading and AI adjudication. Expanded live run reports identify their model versions and grade status separately. No completed human calibration is claimed. Excerpt/path/schema validation proves annotation consistency, **not semantic entailment**. The implemented runner reuses production `runTurn` and tools, captures the actual delivered text, and distinguishes:

1. Citation ID validity, deterministically checked against the delivered ledger.
2. Claim correctness and preservation of relevant qualifications.
3. Claim support by attached evidence, including jointly supporting sets.
4. Important supported claims left uncited, and unnecessary/irrelevant citations.
5. Honest missing-information handling and explicit separation of inference from source claims.
6. Tool use, latency, tokens and failure/stop reason, reported separately from quality.

Use deterministic checks where they suffice and human review for rubric/grader disagreements. Treat model grades as provisional until independently calibrated. Fix grader/model versions and prompts. Repeated trials and paired item-level uncertainty estimates belong to live comparisons, not this deterministic lexical run.

## Expanded suite and review boundary

`expanded.ts` builds the suite from the 48 explicitly authored source-bound seeds in `suites/expanded/seeds.json` plus the preserved pilot. Two retrieval phrasings per new answer task share one family and split; four extra no-answer phrasings remain in their original development families. `npm run eval:build` refuses to overwrite a frozen suite. Create a versioned suite for intentional annotation changes, rather than altering labels after observing test failures.

The 12 answer test items use seven primary source-work groups absent from development: the IR textbook, RRF, the Deep Learning textbook, SimCLR, XGBoost, Factorization Machines and ComiRec. Generic topic overlap and related mechanisms can still exist; source/family isolation is not a guarantee of semantic independence from every concept. Questions are synthetic, and the author saw their source notes while preparing annotations.

Use `EVAL_SUITE=pilot` to reproduce the old retrieval or Agent pilot. `npm run eval:full` always uses the expanded suite and its frozen 86-job plan. It orders development/comparisons, robustness, then held-out tasks. Fixed-retrieval/no-vault comparisons and repeated trials use six predeclared development IDs, not cases selected by observed success. Report their small sample size alongside results.

Prompt injection and conflicting content live only in `robustness/cases.json` and in-memory corpora. Interface invariants are free deterministic checks; resistance to embedded instructions requires live Agent responses and semantic grading. Historical recordings remain regression material for their original corpus.

See [ADR-0017](../docs/adr/0017-frozen-learning-corpus-evaluation-pilot.md) for the preserved pilot, [ADR-0016](../docs/adr/0016-source-grounded-learning-dataset.md) for learning-first corpus construction, and [ADR-0020](../docs/adr/0020-frozen-expanded-evaluation-and-isolated-comparisons.md) for the expanded plan.

## Tool v2 and offline vector experiments

New retrieval reports default to `eval/reports/tool-v2`; set `EVAL_REPORT_DIR` to another versioned directory. The frozen historical report directory is rejected as a destination. Run `npm run eval` for lexical regression and `EVAL_MODE=smoke EVAL_ALLOW_API=0 npm run eval:full` for production-loop mechanics without model calls.

`npm run eval:vector` benchmarks fake-vector exact scanning, host cache rebuild/hits, query-cache latency and 10x synthetic scaling. It writes `vector-mechanics.json` and `fake-vector-pool.json` to the versioned report directory. This test encoder measures mechanics only: it makes no semantic quality, human-review or Agent-answer claim. `compareRetrievers` accepts a prepared exact index and explicitly configured cached provider; offline cache misses throw without live fallback. For genuine experiments, freeze a new common candidate pool, review all pooled entries and use the predeclared protocol before quality scoring.

See [execution report](../docs/tool-optimization-results.md) for implemented tools, reproducible commands, deferred paid checks and measured database/planning decisions.

### Genuine local Ollama development run

`npm run eval:ollama` uses the installed `qwen3-embedding:0.6b` through loopback only, creates disposable caches under the OS temporary directory, and writes new reports to `eval/reports/ollama-local`. It encodes the unchanged 318-section fixture and 96 development queries plus one independent Chinese integration query. It never opens held-out query outcomes, calls a paid provider, grades answers or fabricates pool labels. Install/start Ollama first. Model digest, query instruction, implementation hashes, token usage, cache accounting and scan timings are recorded. Reviewed union labels and answer-quality gates remain pending.

### Reviewed local quality and selected fusion

The free `eval:local-quality` experiment freezes 120 development queries, 24 fresh final phrasings and three weight candidates in `suites/local-hybrid-v1`. Complete source-reviewed AI labels compare BM25/dense/hybrid at identical cutoffs. Stage `score` reuses development artifacts; `score-final` reuses the single chosen-variant checkpoint. Preparation cannot overwrite frozen development labels, final redispatch is rejected, and missing/invalid/uncertain judgments block scores. The initial local Gemma2/Llama3 judge trials were excluded; Codex's source-aware AI review is unblinded and uncalibrated, with receipts/quotes saved as a new version.

BM25:dense 1:2 was selected only on development and is now used by opt-in local search. The final lacks an exact-term slice and cannot establish the complete promotion gate. Paid answer evaluation remains deferred. See [quality results](../docs/local-retrieval-quality-results.md), [ADR-0025](../docs/adr/0025-local-retrieval-quality-and-dev-selected-fusion.md) and `reports/local-hybrid-quality-v1` for labels, scores, raw rankings and identity/accounting. Vectors and source-review checkpoints live in the ignored artifacts directory.

## Agentic RAG paired driver

`AGENTIC_PHASE=prepare npm run eval:agentic-rag` freezes a fresh 66-job protocol without constructing answer/judge/embedding providers. An existing `EVAL_MODE=live` does not activate this driver. Live execution separately requires `AGENTIC_PHASE=live`, `EVAL_ALLOW_API=1`, explicit answer/judge model/rate JSON, positive spending and call allowances, keys, and pinned local Ollama. Three variants share configurations and rotate order: BM25, hybrid, hybrid plus same-model self-review. Repeats multiply the fixed plan. Paid execution is deferred; preflight is not quality evaluation.

New cases in `robustness/agentic-rag-v1.json` are synthetic, in memory, and independent of the frozen learning vault. Previously-used test tasks are regression material. Raw recordings, failures, complete implementation/data bindings and pending independent human-review sheets are retained in fresh directories. See [implementation and validation](../docs/agentic-rag-results.md).
