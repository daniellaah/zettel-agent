# ADR-0017: Frozen learning corpus and offline evaluation pilot

- Status: Accepted
- Date: 2026-10-02
- Refines: ADR-0011 (evaluation design), ADR-0016 (source-grounded learning dataset)

## Context

The owner completed a 318-note English learning corpus and authorized the next deliverable: twenty retrieval questions, twelve answer rubrics, a repaired offline evaluation command and a retrieval baseline. The old runner still attempted to load deleted judgments for the historical corpus. Paid agent and judge calls are outside this phase.

## Decision

1. Freeze exact fixture-note bytes, paths and stages in a versioned SHA-256 manifest, with a digest for the external source audit. Evaluation does not change learning notes or call a model. New corpus content needs a deliberately reviewed new version, rather than silently moving the baseline.
2. Store all question metadata and evidence excerpts in `eval/`, outside the vault. Use strict runtime schemas and validate every note path, excerpt, provenance edge, source field and declared question-family split. These checks establish integrity; they do not establish semantic support on their own.
3. Author twenty independently phrased synthetic development queries with graded note-level judgments. Pool the top twenty from each existing tokenizer mode, inspect the candidates, and supplement them with known supporting notes. Keep explicit grade-zero judgments distinct from unjudged notes. Label the initial review status honestly as author-reviewed and owner-review-pending.
4. Report Recall@5/10, MRR@10 of sufficient notes, linear-gain nDCG@10, metric denominators, unjudged candidates and per-item misses. Exclude no-answer queries from metrics with an empty positive denominator. Lexical matches alone do not constitute hallucination or answer failure.
5. Author twelve answer rubrics around required claims, alternative sufficient evidence sets, forbidden conclusions and answerability. Preserve the distinction between literature paraphrase, permanent-note reasoning and metadata provenance. For a multi-record support set, all members are jointly needed; different sufficient sets are alternatives. Missing owner facts do not acquire fabricated evidence.
6. Keep all initial items in dev. No held-out score, live agent answer, semantic judge result or owner review is claimed. A future live harness reuses production `runTurn` and tools, initializes independent trials, records actually delivered evidence text and budgets, and calibrates semantic grading against human review before reporting quality.
7. Generate readable and machine-readable baseline reports bound to dataset and implementation hashes. Add evaluation integrity and metric tests to the regular offline check command. An invalid fixture fails; this initial quality baseline has no arbitrary performance threshold.

## Consequences

- The owner can review concrete questions, evidence and failure cases before API expenditure or retrieval tuning.
- Tests catch accidental corpus edits, stale excerpts, false graph expectations and declared family leakage. Owner-review status and semantic correctness still require human judgment.
- Current-mode pooling and a small synthetic dev set limit generalization. Further retrievers require additional relevance review; higher scores are not automatically agent-quality improvements.
- The accepted next scale remains 120 retrieval queries and 60 answer tasks, with question-family-separated held-out cases frozen before tuning. No artificial personal facts, aliases, contradiction pairs or malicious learning notes are created to fill quotas.
- Injection and fleeting-scope fixtures remain isolated, and legacy provider cassettes are only wire/loop regression tests for this phase.
- Live model calls and calibrated judge execution require separate API-budget authorization. No plugin runtime, prompt, provider, UI or vault-write capability changes here.
