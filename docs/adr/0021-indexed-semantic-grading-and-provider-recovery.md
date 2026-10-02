# ADR-0021: Indexed semantic grading and provider recovery

Status: accepted, 2026-10-02.

## Context

The independent Anthropic judge exhausted its provider credits. Both graders also produced structurally invalid verbatim quotations, missed reused citation occurrences, or selected uncited evidence. Repeating the solver or discarding failed grades would distort the frozen evaluation and waste the approved allowance.

## Decision

Preserve every original solver run, grader attempt and budget record. Provider recovery reuses unchanged answers and records a distinct grader version. The replacement is explicitly configured and priced, rather than an automatic runtime-provider fallback. Primary scores use one declared replacement grader; independent earlier Anthropic results remain diagnostics. Using the same model for solver and grader introduces correlated-error risk and is not independent human calibration.

`indexed-scoring.ts` supplies every contiguous answer paragraph or bullet block and a selectable bank of exact delivered evidence quotes. The model selects integer indices, factual kind, conjunction-level support, citation relevance, point coverage and forbidden conditions. The engine materializes original answer/evidence substrings without paraphrasing them or changing model verdicts. Every unit must be assessed once, every citation occurrence stays within a assessed original unit, and citation-bearing units cannot be skipped as nonfactual. All factual clauses in a unit must be supported for that unit to be supported. Original reference excerpts assess correctness only.

These are paragraph-unit judgments; their claim counts and support rates must not be compared directly with earlier free-form claim extraction. Source-bound quotation validation still does not prove entailment, completeness of factual classification, or reliability of a model's choice of a heading rather than a substantive passage. Quotes that contain only labels and overbroad absence assertions need review.

Recovery operators require exact frozen corpus, dataset, source-audit and production implementation bindings. Inherited answers and costs have explicit source paths and SHA-256 hashes. Only unrun solvers are called; a failed repeated solver sample is retained instead of retried into success. A historical budget failure does not halt a new recovery phase. Each phase shares an explicit new allowance, and its spending is separate from inherited historical usage.

The owner's delegated AI review may repair invalid model selections or adjudicate semantic disagreements, but must identify its reviewer kind, review scope, original result hash, changes and evidence. Original model scores, failures and human review sheets remain unchanged. AI-assisted judgments do not become human labels. Final reports distinguish raw model-grade validity, AI recovery and failed solver outcomes.

The quote extractor appends missing interior paragraphs adjacent to note wrapper tags without shifting legacy indices. This repairs the grading interface using already delivered text, without changing the solver or frozen rubrics. Strict offline replay may use the original quote pool only after validating every quote's call, evidence ID, exposure scope and exact source text; all other judge-input fields must match. It reproduces original failures before separately validating AI repairs. A budget-rejected dispatch has no response cassette and is reported as a replayed prefix of a failed solver, never as a successful full replay.

## Consequences

The production plugin and read-only tools stay unchanged. The indexed interface reduces quote copying but still exposes model grading failures rather than converting them into Agent errors or passes. All controlled robustness data remains outside the learning corpus. Frozen test outcomes must not be used to tune the solver or relabel the dataset. Further independent judging requires replenished provider credit; the current fallback and AI review are provisional and explicitly unblinded.
