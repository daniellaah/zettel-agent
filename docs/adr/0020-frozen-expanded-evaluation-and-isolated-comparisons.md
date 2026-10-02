# ADR-0020: Frozen expanded evaluation and isolated solver comparisons

Status: accepted, 2026-10-02.

## Context

The 20-query/12-task development pilot could not establish held-out performance, repeated reliability, comparative costs or resistance to adversarial notes. The owner delegated current adjudication to AI rather than performing human labeling. Learning notes must stay source-grounded and unchanged.

## Decision

Preserve the pilot and its recordings. Add an explicitly AI-authored suite at `eval/suites/expanded`: 120 retrieval queries (96 dev, 24 test), 60 answer tasks (48 dev, 12 test). Seed annotations name the frozen literature record and reviewed supporting permanent thoughts. Freeze exact annotation and seed hashes before live scoring. Primary source works and declared question families do not cross the development/test boundary. Existing published-source audit and all 318 learning notes retain their original hashes.

Expanded relevance labels cover explicit positives and unrelated controls; unlisted candidates remain unjudged. Metrics report provisional zero gain and unjudged counts rather than claiming an exhaustively reviewed pool. AI annotations are not blind human gold. Test outcomes must not be used to tune the current implementation.

`eval:full` defaults to free mechanics smoke. Its predeclared plan includes 60 ordinary production-loop trials, six fresh second trials, six deterministic top-five retrieval trials, six no-vault trials, and eight isolated robustness trials: 86 jobs total. Comparisons use the same model and system prompt, with no reference annotations supplied to any solver. Fixed retrieval reads the first five lexical matches with production tools, then disables tools for one answer request per turn. No-vault supplies no note content and disables tools. These are evaluator-only runners, not extra agent tools.

Run development before independent robustness and held-out tasks. Two workers share one conservative spending allowance. Record every response, actual delivery, failed grade, stop reason, token count and latency. Resume is allowed only when configuration, frozen datasets and implementation bindings match. Replay requires exact requests, full cassette consumption and zero live fallback. Missing/failed jobs remain explicit; quality failures do not become harness failures or disappear from denominators.

The judge incorporates the six-case AI adjudication rules, checks every citation occurrence, and binds exact evidence quotations to the matching delivered note/section. It may repair structural output twice, preserving all attempts. Structural validity does not establish semantic correctness or exhaustive claim extraction. The AI adjudication remains explicitly unblinded; human sheets are not filled with AI decisions.

Robustness notes are synthetic and exist in separate in-memory corpora. They test embedded role overrides, wrapper closures, fabricated personal measurements, conflicting content, fleeting exclusions, graph-versus-body support, regex failure recovery and title-only evidence. Deterministic interface checks additionally reject write tools, external reads, invalid regexes and unknown IDs. None of these fixtures are literature notes or modifications to the learning corpus.

## Consequences

The evaluation is reproducible without Obsidian, defaults to no paid requests, and measures retrieval, answer correctness, citation semantics, costs, latency and repetition separately. Comparisons use only six paired development items and robustness uses eight cases; results are descriptive, not a comprehensive safety or statistical superiority claim. Provider invoices remain authoritative, and failed requests may retain unknown-cost reservations. A model-graded test set is useful for development but does not replace independent human calibration or real owner queries.
