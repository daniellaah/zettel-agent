# Agent evaluation operator guide

The Node runner reuses the production loop without Obsidian, reads only `fixtures/vault`, verifies the frozen corpus/source audit, and writes under git-ignored `eval/artifacts/`. It does not modify learning notes or read the owner's vault.

## Free mechanics validation

```bash
npm run check
npm run eval
npm run eval:agent
EVAL_REPEATS=2 npm run eval:agent
```

The default mode is **smoke**. Scripted responses exercise real search/read tools and follow-up setup questions, then deliberately give a non-answer. Scripted scores are mechanics checks, not model-quality measurements. No API is contacted, even if credentials exist.

`EVAL_IDS=a01,a07` selects cases. `EVAL_SPLIT` defaults to dev; unknown or wrong-split ids fail. The default expanded suite has 12 independent test items; use `EVAL_SUITE=pilot` for the original development-only pilot. `EVAL_REPEATS` is 1–10; each trial resets its conversation/ledger.

## Live development baseline (paid)

Configure credentials in the launching process using `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `DEEPSEEK_API_KEY`, or put these variables in the git-ignored `.env.eval.local` at the repository root. The `eval:agent` and `eval:calibrate` scripts load this optional file through Node's built-in dotenv support; existing process variables take precedence. Keep its permissions at `600`. Do not put credentials in evaluation JSON, Git or chat. Obsidian secret storage is not automatically available to standalone Node.

The local file can start with the following blank credentials and free-mode settings. Filling credentials alone does not enable paid calls:

```dotenv
DEEPSEEK_API_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
EVAL_MODE=smoke
EVAL_ALLOW_API=0
```

Live mode requires:

- `EVAL_MODE=live` and `EVAL_ALLOW_API=1`.
- `EVAL_AGENT_MODEL` and `EVAL_JUDGE_MODEL`: JSON with `provider`, `model`, and `rates` (`input`, `output`, `cacheRead`, `cacheWrite`, USD per million tokens). Providers: anthropic/openai/deepseek. Enter explicit current rates; no model or prices are guessed.
- `EVAL_MAX_USD`: positive shared allowance; optional `EVAL_MAX_CALLS` defaults to 200.
- Corresponding credentials.

Run `npm run eval:agent`, starting with a small dev selection before the full pilot or repeats. Calls reserve conservative input/output cost before dispatch; returned usage releases unused reservation. Failed/aborted calls keep unknown-usage reservations. Provider retries/fallback billing can differ: this is estimated preflight control, not a guaranteed billing cap. `apiCalls` counts logical dispatches, not SDK HTTP retries.

Reports bind corpus, audit, annotations, implementation and lockfile. Live results use the documented AI adjudication rules; they remain model judgments without independent human calibration. Failures/ungraded trials stay in denominators. Missing prices mean unavailable cost, not zero. Any-trial success and replay do not establish first-delivery reliability.

## Artifacts and grounding

Each case/trial creates run, judgment, request/response recording, pending human-review sheet, and independent human packet JSON files. `report.json` aggregates attempts. They contain fixture text and model transcripts and are git-ignored. Recordings contain no authorization headers or keys.

Runs capture exact tool results, title/preview/excerpt/body/graph scopes, revision-bound ids, tool durations and first-visible-text timing. First visible text may be a progress statement, not the final answer. Gold references assess correctness only; citation support must come from exact text delivered during the case. Titles or links do not establish substantive body claims.

The judge evaluates every key point/forbidden condition, extracts factual claims including unsupported extras, checks jointly cited support, and assesses each citation's relevance. Every citation occurrence must be assessed, and support quotations must occur inside the corresponding delivered note/section for that ID. Structural validation still does not certify entailment or exhaustive factual claim extraction. These require independent review; the current delegated review is AI-only.

Zero-id and error tool results also remain visible to the judge for checking search scope and absence statements.

## Judge-only regrading

`npm run eval:regrade` reads original runs from `EVAL_SOURCE_DIRS`, a JSON array of directories inside `eval/artifacts/`. It defaults to free scripted smoke and never calls the agent. Live regrading requires `EVAL_MODE=live`, `EVAL_ALLOW_API=1`, explicit `EVAL_JUDGE_MODEL` prices, credentials and a shared `EVAL_MAX_USD` allowance. `EVAL_IDS` and `EVAL_SPLIT` filter cases; duplicate item/trial sources fail rather than selecting a preferred trial.

```bash
EVAL_MODE=smoke EVAL_SOURCE_DIRS='["eval/artifacts/an-original-smoke-run"]' npm run eval:regrade
```

The original source corpus, annotations and actual judge input must match. Legacy zero-id/error tool outputs can be restored only when verbatim matches occur in recorded requests actually sent to the agent. New outputs copy the unchanged run, preserve source hashes/bindings, and bind the new grader implementation. Source recordings and human reviews are never overwritten. A changed agent implementation does not regenerate the original answer.

The judge may repair complete but structurally invalid JSON with bounded retries. The agent runner allows one repair; regrading defaults to two, configurable with `EVAL_JUDGE_REPAIRS=0|1|2`. Refusal/truncation/API errors are not formatting retries. Every attempt is retained, all returned usage is charged to the allowance, and first-attempt validity is reported separately. Invalid judgments remain failures. Regrading scores describe existing answers; they are not fresh agent trials or a calibrated quality result. The regrade report's `estimatedJudgeUsd` is new spending; its historical agent timing/usage is descriptive, with agent cost unavailable and `agentApiCalls=0`.

## Independent human review

1. Open the human packet and run before the judge output. Inspect the answer, references for correctness, and actual deliveries for grounding.
2. Fill labels independently: keyPoint = covered/partial/missing/contradicted; forbidden = present/absent; claim = supported/partial/unsupported/contradicted; citation = supporting/irrelevant/unknown; abstention = appropriate/inappropriate/not-needed.
3. Record exact answer substrings for missed factual claims in `omittedClaims`. Add reasons in comments, identify the reviewer, complete every label, then mark reviewed. Preserve hashes; do not copy model verdicts into the human sheet.
4. Set `EVAL_REVIEW_DIR` to the absolute run directory inside `eval/artifacts/`, then run `npm run eval:calibrate`.

Stale bindings, incomplete labels and invalid categories fail. Zero completed reviews fails and reports not-calibrated. Agreement/kappa are per reviewed case and dimension; mixed-dimension kappa is omitted. Inspect false support and missed claims, revise on dev data, and validate on fresh examples. Representative sampling and adjudication are necessary; a model cannot replace the human reviewer.

## AI-assisted adjudication

The owner has delegated the current pilot judgments to Codex. The six recorded
development answers have a completed AI adjudication, documented in
[AI-assisted pilot adjudication](ai-calibration.md). This is the selected workflow
for continuing development; independent human review is not a blocking step.
AI judgments remain identified as AI and are stored separately from human sheets.
The human calibration command does not ingest them. The review was unblinded and
made no new API calls. These decisions define review rules for the pilot; they do
not establish a calibrated runtime model judge or held-out answer quality.

## Strict offline replay

```bash
EVAL_MODE=replay EVAL_REPLAY_DIR=/absolute/path/to/eval/artifacts/a-run npm run eval:agent
```

Select the recorded ids, split and repeats. Corpus, annotations, implementation bindings, prompt, schemas and actual tool results must match; changed requests fail. Recorded token usage belongs to the original trial, while replay latency is local and API spending is zero.

## Full expanded run

`npm run eval:full` uses the frozen expanded suite regardless of `EVAL_SPLIT`. It predeclares 86 jobs: 60 Agent tasks, six second Agent trials, six fixed-retrieval trials, six no-vault trials and eight separate synthetic robustness tasks. Development and comparisons execute first, attacks next, test cases last. Two workers share the same budget. `EVAL_IDS` and `EVAL_REPEATS` overrides are rejected because this runner preserves its declared plan.

Use the same live opt-in and model/rate variables as `eval:agent`, with enough `EVAL_MAX_CALLS` for all jobs. Costs include all grader repair attempts; failed requests retain conservative unknown-usage reservations. The run stops on allowance exhaustion and reports every unrun job explicitly.

`EVAL_FULL_RESUME_DIR=/absolute/path/to/full-run` resumes only unfinished jobs under the exact same implementation, configuration and annotation bindings. It does not overwrite or retry completed failed samples. Intentional regrading must preserve the original recordings and identify a separate grading round. `EVAL_MODE=replay EVAL_REPLAY_DIR=/absolute/path/to/full-run npm run eval:full` consumes all exact recorded solver/grader requests with no API calls; implementation and data bindings must match.

Reports distinguish dev, test and robustness, and expose six paired comparator results plus first/any/all-trial repeat reliability. A no-vault solver may provide labeled general knowledge; it cannot earn note-grounding credit without delivered evidence. Comparator histories and active-note context match the tasks, while tools are disabled. Test scores are a final evaluation checkpoint, not a tuning target. Keep failures in reported denominators.

Each full job saves immutable run, recording and result files; successful judgments include all repair attempts. Failed judgments save their errors and attempts. `report.json` has full bindings, planned/completed/unrun counts, tokens, estimated costs, latency and paired results; `report.md` is the readable summary. The expanded suite and current robustness plan are documented in [ADR-0020](../docs/adr/0020-frozen-expanded-evaluation-and-isolated-comparisons.md).

## Indexed grading and credit recovery

`eval:indexed` reuses immutable answers from a saved full run and grades every primary answer with one explicit replacement judge. It uses answer paragraph/bullet units and selectable exact evidence quotes, so the model chooses indices rather than copying quotations. Every factual clause in a unit must be supported; these unit counts are not directly comparable with the original free-form claim counts. Titles alone do not prove body claims. Model semantic errors and invalid selections remain visible.

Set `EVAL_FULL_SOURCE_DIR` to the original `eval:full` artifact directory. Normal live opt-in, explicit model/rate settings and a new shared allowance still apply. Solver model/rates and frozen bindings must match the original. Existing answers are not regenerated. The earlier independent grader's scores and failed calls remain in their original directory.

`eval:finish` continues an indexed run with a separately approved phase allowance. Set `EVAL_FULL_SOURCE_DIR` to the indexed artifact directory. To inherit an already completed finish phase, additionally set `EVAL_FINISH_RESUME_DIR` to that finish directory. All completed trials, including solver and grader failures, are retained; only unrun jobs execute. A previously recorded allowance failure is not a reason to halt the new phase. Reports bind source result files and distinguish inherited historical usage from new spending.

These recovery commands are explicit live operators, not default free smoke commands or automatic provider fallbacks. A provider without usable credit cannot produce independent grades. Using DeepSeek for both solver and fallback grader is disclosed as correlated model judging, with AI-only review and no human or blind calibration. Original failures remain available even after an AI adjudication repairs a judgment.

See [ADR-0021](../docs/adr/0021-indexed-semantic-grading-and-provider-recovery.md).

## Completed evaluation v1 and free verification

The [final report](reports/evaluation-v1.md) and [machine-readable summary](reports/evaluation-v1.json) record the completed 86-job execution, original judge failures, 23 delegated AI repairs, source bindings, cumulative costs and provisional scores. The failed repeated solver remains a failure. No new API call is needed to inspect or verify these saved outputs.

```bash
EVAL_FULL_REPLAY_DIR=eval/artifacts/2026-10-02T20-37-33-540Z-full-finish-live npm run eval:full-replay
EVAL_AI_REVIEW_DIR=eval/artifacts/2026-10-02T20-37-33-540Z-full-finish-live/ai-recovery npm run eval:ai-recover
```

`eval:full-replay` has no live-provider construction or network fallback. It checks inherited recording hashes, regenerates the actual solver requests/tool results and consumes every recorded exchange. It binds a legacy indexed quote pool to actual deliveries while requiring unchanged answer, references, schemas and delivery input. It reproduces 63 valid and 23 invalid original judge outputs. The budget-rejected solver dispatch is represented only by its recorded prefix and retained error; 85 complete solver runs replay exactly.

`eval:ai-recover` validates the explicitly identified AI review records, source hashes, selectors, quotation scope and resulting judgment structure. Draft or invalid reviews remain pending. Reviewed records are materialized into a separate `validated/` directory; original model judgments and human sheets stay unchanged. Its report exposes pending counts, raw-source hashes and AI-only review limitations. The current 23 reviews are unblinded structural/classification and selected grounding adjudications; unreviewed model semantic decisions are retained. This command does not provide independent entailment validation or human agreement statistics.
