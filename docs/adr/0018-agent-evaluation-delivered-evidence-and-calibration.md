# ADR-0018: Agent evaluation with delivered evidence and human calibration

- Status: Accepted (implementation; live quality and human calibration pending)
- Date: 2026-10-02
- Refines: ADR-0017

## Context

The frozen retrieval pilot does not run the agent or grade answers. An evidence id does not prove the model saw its section's full text: list and links can register an id while returning only a title or graph facts. Grading against full source notes would overstate citation support.

## Decision

1. Reuse the production `runTurn`, tools, prompt and adapters in Node without changing runtime behavior. Reset transcripts and evidence between trials. Run actual history questions before follow-ups; no gold answers or fabricated history enter agent requests. An active note is context, not an implicit attachment.
2. Capture exact tool inputs/outputs, evidence references, revision hashes, descriptive exposure categories, timing and transcripts. Ground citations only in actual deliveries from the case, including setup turns. Never expand a preview into an unseen source note.
3. Separate rubric coverage, forbidden assertions, note-claim support, citation relevance and abstention. The tool-free model judge sees correctness references separately from deliveries. Validate label completeness, answer quotes, ids and delivered support quotations. These checks do not certify entailment or complete claim extraction.
4. Generate independent human packets without judge verdicts and blank pending label sheets bound to exact run/judgment hashes. Humans can flag omitted claims. Report category-specific agreement, Cohen's kappa, false support and disagreements. Pending review never counts as calibration; representative live examples and adjudication remain required.
5. Keep `npm run eval` free and retrieval-only. `npm run eval:agent` defaults to scripted mechanics smoke, not model quality. Live mode requires explicit opt-in, model/rate configurations, credentials and a shared allowance. Conservative spending reservations cannot guarantee provider billing, retry or fallback costs; failed calls retain unknown-usage reservations.
6. Record provider-neutral requests/responses without credentials or headers. Replay requires identical corpus, annotations, implementation bindings and exact requests including tool results. It verifies recorded behavior, not a fresh model trial or changed-tool quality.
7. Keep failures in denominators. Report first/any/all observed trial success, stage cost and latency separately. Pilot pass thresholds remain provisional. Store transcripts and reports in git-ignored `eval/artifacts/`; verify the learning corpus before and after runs.

## Sequence and consequences

Run and calibrate the 12-task pilot first. Then expand to 120 retrieval queries and 60 agent tasks, freeze family-separated test items before tuning, optimize against development failures, and evaluate held-out checkpoints. Keep robustness payloads outside learning notes. The runtime remains read-only and unchanged; larger task sets, live quality runs, independent calibration and isolated robustness trials are still required.
