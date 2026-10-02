# Tool optimization and semantic retrieval plan

Status: proposed implementation plan; 2026-10-02. This document is the handoff for a new coding conversation. It authorizes no paid run by itself and changes no runtime code or notes.

## Objective and starting point

Improve evidence discovery, complete reading, source attribution and bounded vault surveys while preserving the read-only Zettelkasten research agent. Implement the five tool improvements below, evaluate semantic retrieval, and introduce a vector database only when measured requirements justify it.

The production registry currently contains `search`, `match`, `read`, `links` and `list`. Retrieval uses in-process TypeScript BM25F and a link graph. `Corpus.search` already supports `perNote` internally, but the Agent search schema returns one section per note. The Agent reads tool results through a revision-bound evidence ledger.

The completed [evaluation v1](../eval/reports/evaluation-v1.md) has 318 frozen notes, 120 retrieval questions and 60 primary Agent questions. Development strict passes are 7/48; development macro note grounding is 67.7%, versus 99.5% key-point coverage. Retrieval labels remain incomplete, and semantic judging uses a correlated replacement model plus unblinded AI review. These are provisional measurements, not calibrated human gold. Improvements must address both missing evidence and the use of delivered evidence; embedding quality alone cannot fix uncited assertions.

Read [AGENTS.md](../AGENTS.md), [architecture](architecture.md), [ADR-0008](adr/0008-read-only-agent-own-loop.md), [ADR-0013](adr/0013-exclude-fleeting-from-research.md), [ADR-0020](adr/0020-frozen-expanded-evaluation-and-isolated-comparisons.md), and [ADR-0021](adr/0021-indexed-semantic-grading-and-provider-recovery.md) before implementation.

## Boundaries

- Agent-reachable code never creates, edits, renames or deletes vault files. Copy and Insert remain explicit user actions. A vector cache is derived infrastructure, never a replacement for Markdown notes.
- Notes, metadata, titles and external model output remain untrusted data. Preserve note-wrapper escaping across every output format.
- Fleeting notes remain excluded from lexical search, graph browsing, matching, reading, embedding generation and embedding caches. Stage changes remove obsolete indexed entries.
- Keep Obsidian imports in `src/vault/` and `src/ui/`. Retrieval, tools, evaluation and sessions stay testable in Node.
- Test with fixture data and isolated in-memory attack notes. The owner's real vault is read-only and is not the test target.
- Preserve existing unrelated working-tree changes, the 318-note corpus, v1 annotations, raw failures, AI reviews and recordings. Do not commit, reset or overwrite them incidentally.
- Record new architectural decisions in new ADRs when implementing. This proposed plan does not supersede existing ADRs.
- Keep the five existing evidence tools initially. Shell, network browsing and vault-write tools are outside this scope. Optional planning state is a later conditional item.

## Work packages 1–5

| ID  | Work package                                   | Dependencies              | Primary outcome                                         |
| --- | ---------------------------------------------- | ------------------------- | ------------------------------------------------------- |
| T1  | Common result contract and delivery provenance | None                      | Explicit evidence scope, limits and result completeness |
| T2  | Complete, bounded `read`                       | T1                        | Outline, continuation and safe revision handling        |
| T3  | Precise, bounded `links`                       | T1                        | Correct graph facts and connection states               |
| T4  | Paginated `list` and `match`                   | T1; coordinate T3 filters | Complete surveys with consistent filtering              |
| T5  | More useful lexical `search`                   | T1–T2                     | Multiple relevant sections and clear ranking provenance |

### T1 — Common result contract and provenance

Add a typed, versioned result envelope. Keep compact model-visible summaries and existing escaped note bodies; avoid a wholesale JSON-only response rewrite before inspecting the UI and grader consumers.

Required information:

- Tool name and result-contract version.
- Effective query and filters; scope restricted to the accessible research corpus.
- Returned count with its unit: notes, sections, lines or graph neighbors.
- Matching/candidate count where available, with `exact`, `lower-bound` or `unknown` semantics. Ranked candidates are not a count of every relevant note.
- `hasMore`, `truncated`, a continuation cursor when supported, and an index/corpus revision.
- Exposure records for actually delivered spans: evidence ID, path, section, content hash, and title/metadata/preview/excerpt/body/matched-line/graph scope. Bind these to each tool delivery, not solely to the conversation-wide evidence ID.
- Distinct recoverable errors, such as invalid input, missing target, stale reference, invalid cursor, unavailable semantic index and invalid regex. Include a useful next action without fabricating evidence.

Inspect `src/agent/tools.ts`, `evidence.ts`, `messages.ts`, `loop.ts`, session attachments, UI result rendering and `eval/agent-runner.ts`. Evidence IDs retain section/revision identity; one ID seen through `list` does not prove its body was delivered. A later `read` can expose more text for that same revision without falsifying the earlier delivery record.

**Acceptance:** title-only and graph-only outputs remain visibly distinguishable from body evidence; zero-result/error outputs carry their searched scope; all returned IDs correspond to delivered records; metadata and injected wrapper closures cannot escape their data boundary. Adapt evaluator extraction and fixtures to the new contract without using full corpus text as hidden support.

### T2 — `read`: outline, continuation and revisions

Extend the existing target form (`E#`, exact path/title, optional heading) with bounded outline/section/body reading and continuation. Final schema naming belongs in the implementation ADR; new fields should be optional where compatibility permits.

- An outline lists section IDs and full heading paths without pretending to deliver section bodies.
- A body page returns a bounded span, revision and a cursor for the next unread span. Handle a single oversized section as well as many short sections.
- A cursor binds target, content hash, position and read mode. Edits, renames or deletion invalidate it with a clear recovery action.
- A stale `E#` must not silently expand into an unrelated whole note when its old section disappears. Resolve current content explicitly and register its new revision.
- Handle repeated headings and ambiguous targets without silently selecting unrelated content. Preserve Obsidian-compatible link resolution where the source context identifies the target.
- Include bounded bibliographic metadata and exact link identity; distinguish metadata delivery from support for body claims.

**Acceptance:** successive pages reconstruct requested text without gaps or duplication; every cap/truncation is reported, including truncation inside the first oversized section; stale continuation fails safely; empty notes and repeated headings work; old citations remain tied to their old revision. Total output respects the loop budget, including wrappers and metadata.

### T3 — `links`: connection state and bounded traversal

- Return explicit outgoing/backlink counts and `isOrphan`. Define orphan as zero resolved incoming and outgoing edges in the accessible graph.
- Distinguish orphan, no backlinks and no outgoing links. A permanent note linked only to its literature source is not an orphan.
- Preserve unresolved targets separately; explain that graph coverage is limited to the research corpus.
- Add direction, bounded neighbor limits and continuation for large neighborhoods. Depth-two results must retain distance and must not imply a direct edge.
- Graph edges establish connectivity. Supports/contradicts/extends are either recorded source data or a proposed interpretation that requires the linked note bodies. Do not infer semantic agreement from adjacency.

**Acceptance:** deterministic tests cover all connection states, cycles, self-links, unresolved targets, both directions and two-hop paths. Counts remain correct when displayed neighbors are limited. Cite graph facts with graph exposure rather than claiming body evidence.

### T4 — `list` and `match`: pagination and consistent scope

Use common research-stage/folder/tag filters and revision-bound cursor handling. Clarify the behavior of empty filter arrays. Do not let the tools disagree about whether an empty filter means all or none.

For `list`:

- Stable ordering, total matching notes, page size, continuation and optional bounded previews.
- Connection-state filters distinguish orphan/no-backlinks/no-outlinks; keep `orphans_only` compatible or explicitly version its replacement.
- Show title, stage, exact path, degree counts and optional source metadata. Previews stay previews.

For `match`:

- Add folder/tag and optional target-note scope, matching the other tools.
- Stable pagination over line matches, exact line identity, and bounded surrounding context when requested.
- Explicit literal/regex mode and case sensitivity; malformed patterns return recoverable errors.
- Address regex execution cost: a length cap alone does not prevent pathological backtracking. Select a bounded supported regex subset or an isolated execution mechanism with a deadline, consistent with single-plugin packaging.

**Acceptance:** all pages equal the complete filtered result, without duplicates; index changes invalidate cursors; exclusion of fleeting and outside-corpus paths applies everywhere; previews and matched lines cannot be graded as whole bodies. Absence statements can describe an exhausted exact search within its filters, not an unsupported assertion about all possible knowledge.

### T5 — `search`: multiple sections and stable lexical behavior

- Expose a bounded `per_note` option using the existing internal capability, with a separate total-section limit so one note cannot consume all results.
- Clearly identify retrieval mode, each result's section/revision and excerpt coverage. Preserve exact titles and source metadata.
- Keep lexical match terms accurate; do not invent keyword matches for later vector results.
- Continue to support consistent stage/folder/tag filters. Ranking scores express retrieval order, not confidence or source entailment.
- Preserve the current lexical defaults and deterministic ranking initially. Separate changing the interface from tuning BM25 weights, tokenizer behavior or candidate ordering.

**Acceptance:** default lexical ranking remains equivalent on the frozen corpus; additional sections are relevant to the query and obey both caps; an excerpt can be expanded with T2; zero matches make no vault-wide absence claim. Use development examples to evaluate multi-section benefits and output-token trade-offs.

## Companion answer behavior

After the result contract is stable, update the prompt only where required to use the new information:

- Cite factual opening summaries, graph descriptions and source-grounded link proposals, including both bodies when needed.
- Read beyond excerpts when the claim requires it; label genuinely outside knowledge.
- Bound absence statements to the searched filters and exhausted pages.
- Keep proposed links distinct from observed graph edges, and retain the user's authorship of permanent notes.

Inspect existing development failures. Do not encode special cases for held-out question IDs, expected paths or rubric answers. Gold references never enter the production tool or prompt. Citation-presence checks may flag missing markers; they must not claim to automatically establish semantic entailment.

## V1 — Offline vector retrieval prototype

Start after T1/T2 define evidence and revision semantics. Implement the prototype in the evaluation/retrieval layer before exposing it to the Agent. No production vector database is required for this experiment.

1. Define an embedding-provider interface and explicit configuration: model/version, dimensions, normalization, metric, batching, cancellation and timeout. Model selection is a separate decision based on English technical retrieval and cross-language queries; no model or price is silently assumed.
2. Embed existing note sections with a documented representation (for example title, heading and body). Bound metadata and record exactly what entered the encoder. Compare alternative representations only on development data.
3. Associate each vector with note path, stable section ID, content hash, representation version and embedding model version. Detect dimension/model mismatch, invalid/zero vectors and incomplete indexing.
4. For this corpus, begin with normalized vectors and exact cosine scanning. Measure actual section count, memory, query latency and rebuild time; note count alone is insufficient to choose ANN.
5. Apply stage/folder/tag filters before selecting the top eligible hits. Removing, renaming or reclassifying a note must remove stale vector entries.
6. Cache successful section embeddings by content/representation/model identity. Persist them in a documented host-managed location outside the vault file tree. Keep filesystem and Obsidian details in host adapters, not retrieval logic. Background/user-driven index maintenance owns cache updates; note-writing APIs are never exposed to the Agent.
7. Treat query embedding, vector search and note-body delivery as separate operations. Search returns current, revision-validated note text through the same evidence contract; vector similarity itself is not citable support.

**Acceptance:** deterministic fake-embedding tests cover exact neighbors, filters, invalid vectors, incomplete indexes, incremental updates and cache invalidation. The first benchmark includes indexing/query cost, cache-hit behavior, model version and embedding representation. Provider failure never silently presents lexical results as semantic results.

## V2 — Hybrid search evaluation and optional production integration

Compare three retrievers on the same queries, candidate labels, filters and output budgets: lexical BM25F, dense vectors, and hybrid retrieval. Use RRF as the initial fusion candidate; document fusion constant, candidate depth, section aggregation and note deduplication. Keep exact technical-token queries and paraphrase/cross-language queries as separate slices.

References for the experiment: [Elastic hybrid retrieval](https://www.elastic.co/docs/solutions/search/hybrid-search), [RRF specification](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reciprocal-rank-fusion), and [Qdrant's exact/full-scan discussion](https://qdrant.tech/documentation/faq/). These motivate candidate approaches, not a database dependency or a guarantee of improvement.

Before using quality scores, review the pooled candidates from all three systems. V1 has 781 unjudged top-ten candidates; unjudged is not a verified negative. Freeze pooled labels as a new evaluation version, retain v1 unchanged, and recompute every compared retriever on the same new labels. AI review remains labeled AI; independent human calibration is not invented.

Predeclare the promotion criteria before inspecting hybrid scores. Proposed development criteria: at least a three-percentage-point improvement in R@10 or MRR@10 over BM25 on the same reviewed labels, at most a two-point loss in the other metric, and no major exact-term slice regression. Confirm uncertainty and denominators; these proposed thresholds may be revised before the experiment, not after selecting a winner. Also report evidence grounding, citation coverage, tokens and monetary/latency overhead. A retrieval improvement alone is insufficient to claim improved Agent answers.

If promoted:

- Add `search` modes `lexical`, `semantic` and `hybrid`; preserve lexical as the default until the declared gate passes. Avoid three redundant Agent tool names initially.
- Explicitly report whether a semantic index is complete, stale, unavailable or used with a disclosed lexical fallback.
- Resolve asynchronous dispatch first: current `executeTool` is synchronous. Network/local embedding generation needs awaited dispatch, cancellation, output budgets and deterministic evidence registration. Keep local read/list/links/match operations simple; migrate loop, attachments, providers and evaluator callers coherently.
- Account for query-embedding requests separately from Agent/judge requests. Offline/replay modes cannot fall through to live embeddings. Record semantic results and provenance without secrets.
- Keep embedding indexing outside a model's tool-control loop. Reuse immutable cached vectors where appropriate; do not rebuild the corpus during each question.

**Acceptance:** compare all three modes on the same versioned labels; feature-disabled behavior remains lexical; interrupted requests commit no misleading partial evidence; all providers accept the new tool schemas. Validate query latency with and without embedding cache, including embedding-provider latency, not just vector scanning.

## V3 — Vector database decision, conditional

An embedding cache is part of V1. A dedicated vector database or ANN index is a separate infrastructure decision, not an automatic prerequisite for semantic search.

Introduce one only when measurements show one or more of:

- Exact eligible-vector scanning exceeds a predeclared interactive latency or memory target on representative vault sizes.
- Durable indexes, incremental updates or filtering are demonstrably difficult with the local cache.
- Product requirements include shared collections, concurrent clients, synchronization or a separately deployed service.

Proposed initial performance target: cached local scanning and filtering p95 below 100 ms on the documented development machine, separate from query-embedding latency. Record the hardware, vector dimensions, section count and workload. This is a target to validate, not a claim about current performance or a universal note-count threshold.

Benchmark exact scanning against an embedded index before choosing an external service. Evaluate packaging, platform support, filtering, deletion/version freshness, backups, index rebuilds, ANN recall against exact neighbors and operational cost. Native add-ons or sidecars need a new packaging ADR because the existing community-plugin design ships one bundle. External services require explicit configuration and a documented deployment path.

**Deliverable even when deferred:** a decision report containing measurements, the reason to keep the local cache, and clear triggers for revisiting. Do not deploy a database merely to make the architecture appear more complete.

## P — Optional session planning, conditional

Keep an explicit plan tool out of the first five work packages. Add it only if development traces show long investigations losing subgoals or repeatedly revisiting completed work.

A future `update_plan` would track a small list of steps/statuses in conversation memory, not write task files or vault notes. Plan text is not evidence and earns no citations or new-evidence credit. Define cancellation, resume and bounded state size; compare quality and extra tokens/calls against the same task without it. Add it only after demonstrating value and updating read-only registry tests and session contracts.

## Execution order and deliverables

| Milestone | Contents                              | Required deliverables                                                                                  |
| --------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| M0        | Baseline and design                   | Working-tree audit; frozen artifact inventory; contract ADR; proposed promotion/budget settings        |
| M1        | T1 + T2 + T3                          | Evidence envelope, bounded complete read, precise graph output; regression tests and docs              |
| M2        | T4 + T5 + answer behavior             | Complete filtered surveys, multi-section lexical search, prompt usage guidance; dev comparison         |
| M3        | V1 + offline V2 experiments           | Embedding abstraction/cache, exact scan, pooled new labels, BM25/dense/hybrid benchmark                |
| M4        | V2 production integration if promoted | Async/cancellation integration, explicit search modes, recorded embedding costs and fresh verification |
| M5        | V3 decision                           | Measured local-versus-index/database decision; implementation only if trigger passes                   |
| M6        | P decision                            | Investigation trace review; optional memory plan experiment only if justified                          |

Each milestone should be independently reviewable. Use new ADRs for accepted contract, asynchronous retrieval and embedding/cache decisions; add a database/packaging ADR only when adopting that infrastructure. Do not implement every proposed field or optional tool before its design and value are checked.

## Testing, evaluation and acceptance

- Add unit tests for every new pure function. Use adversarial and boundary tests rather than tests that only reproduce an implementation.
- Run `npm run check` after each change set: typecheck, ESLint, Prettier and Vitest. The baseline currently has 248 tests across 37 files.
- Before new retrieval runs, add and test a versioned report destination (for example `EVAL_REPORT_DIR`) so changed implementation bindings and results cannot overwrite `eval/reports/retrieval-expanded.*` or historical pilot reports. Keep the existing v1 reports and their hashes intact. Then run free fixture retrieval into the new destination with `npm run eval`, and mechanics smoke with `EVAL_MODE=smoke EVAL_ALLOW_API=0 npm run eval:full`.
- Add isolated adversarial cases for forged cursors, stale revisions, wrapper injection, graph/body confusion, regex failure and unavailable embeddings. Never insert attacks into the learning corpus.
- Changes to loop/providers/prompt/UI require `npm run e2e` under AGENTS.md. It restarts Obsidian on the fixture and calls live models; announce the cost before running. The previous 33-test result is historical, not proof of new behavior.
- A changed schema/prompt/output format intentionally changes strict replay requests. Preserve v1 artifacts and their original implementation bindings. Capture versioned v2 cassettes for new behavior; do not edit old requests to force a false replay pass.
- Keep grading interface changes distinct from solver changes. Preserve all invalid grades and repair attempts, record grader versions, and apply the same grader to both sides of a comparison.
- Perform iteration on development data only. The published v1 test set is now observed and can serve as a frozen regression set, not as a fresh blind test. Freeze new unseen questions before the next final validation. Disclose shared source families if reused; any new source notes belong to a separate corpus version.
- Proposed paid development sample: 12 predeclared development tasks spanning lookup, synthesis, follow-up, graph proposals and missing evidence. Retain six predeclared paired/repeat IDs for comparability. Choose sample IDs and repeat count before results; missing/failed trials stay in denominators.
- Final reports separate retrieval quality, answer correctness, note grounding, citation coverage/precision, bounded absence, graph correctness, attack violations, strict passes, tokens, p50/p95 latency and monetary cost. A high citation precision does not excuse uncited claims.
- Correctness/read-only gates are mandatory. Quality promotion requires improved development results with consistent judging and a fresh final checkpoint; inconclusive results are reported as inconclusive.

## Budget and model decisions

This planning turn makes no model API calls. Coding, fake-vector tests, cached-vector retrieval benchmarks and offline replay are free of model API charges. Generating embeddings, encoding new queries, live Agent/judge comparisons and E2E calls can cost money.

At M0, inspect configuration names and ignored-file permissions without printing secrets. The already configured `.env.eval.local` is not an instruction to spend. The previous evaluation allowance is nearly accounted for after known usage and retained reservations; do not assume it is a fresh tools/embedding allowance.

Before a new paid phase, resolve explicit embedding provider/model, Agent/judge configuration, current rates, phase allowance and maximum logical requests. Keep separate ledgers for indexing, query embeddings, solver, judge and E2E spending. Include cache reads, repairs, discarded responses and unknown-usage reservations. Do useful free work while paid settings remain undecided. Do not silently switch to a correlated judge when independent credit is unavailable; disclose and version any replacement.

Estimate embedding spending from measured input tokens at the chosen provider's current rates. Report full-build, incremental-update and per-query costs separately. A local embedding model avoids provider token charges but still needs measurements for download size, runtime memory, startup and query latency. Store no keys in plans, annotations, transcripts, vector files or cassettes.

## New-conversation starter

Paste this into a new conversation attached to this repository:

> Implement the proposed tool optimization plan in `docs/tool-optimization-plan.md` for Zettel Agent. Read that file and AGENTS.md first. Start with M0 and M1 (T1–T3), then proceed through T4–T5 and the offline vector/hybrid experiment. Preserve the current read-only boundary, exclude fleeting notes everywhere, and keep the frozen corpus and all evaluation v1 results unchanged. Add new ADRs and meaningful unit tests, run the required checks, and report each milestone. Vector DB and an in-memory plan tool are conditional on the plan's measured gates. Use fresh unseen evaluation material for new quality claims. Complete free implementation work first; resolve a new explicit allowance and model configuration before any new paid embedding, Agent/judge or E2E phase. Do not print secrets, commit unrelated changes or modify the owner's vault.
