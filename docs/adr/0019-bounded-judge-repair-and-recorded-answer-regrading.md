# ADR-0019: Bounded judge repair and recorded-answer regrading

- Status: Accepted (implementation; human calibration pending)
- Date: 2026-10-02
- Refines: ADR-0018

## Context

The first six live development answers produced one structurally valid judgment. Rejected judgments omitted citation markers from answer quotations, missed citations, or lacked delivered support quotations. A multi-part rubric point also received full credit despite an acknowledged omission. The initial judge input omitted tool outputs without evidence ids, including zero-match results relevant to absence statements.

## Decision

1. Preserve strict validation. Require exact contiguous answer quotations including associated markers, assess every citation, and require all components of a rubric point for full coverage. Include every actual tool result, marking errors and retaining empty exposure lists; a negative search result does not become a positive evidence id.
2. Permit at most two repair requests after complete but invalid JSON judgments. Supply the validation issues alongside the unchanged original input and prior response. Repairs must retain factual claims and honestly reassess support; do not delete failing claims to pass validation. Refusal, truncation, API errors and cancellation do not trigger formatting retries. Every response and its usage remain recorded. Report first-attempt validity separately from validity after repair.
3. Add a judge-only runner. Validate the frozen corpus/audit/rubric, source identity and original judge input before any dispatch. Reuse original answers and tool deliveries without calling the agent. Preserve original files, hashes and implementation bindings; new grader bindings and judgments go to a new artifact directory. Resolve source symlinks and restrict inputs to `eval/artifacts/`.
4. For the legacy pilot, restore omitted zero-id/error outputs only if verbatim id/content/error matches exist in the original recorded requests sent to the agent. Do not infer missing deliveries from full source notes. Modified or unbound input fails before spending.
5. Keep failed judgments in denominators. Judge-only spending excludes historical agent costs. Regrading is a new evaluation of an existing answer, not a fresh agent trial or evidence of repeated-agent reliability. New human sheets remain pending and refer to the exact unchanged run and new judgment.

## Consequences

The runtime tools, loop, prompt, adapters and vault behavior are unchanged. Formatting repair can improve execution validity but cannot establish complete claim extraction or correct entailment. Human calibration, adjudication and held-out evaluation are still required before interpreting scores as reliable quality measurements. Changing the grader invalidates strict replay of older requests; judge-only regrading intentionally preserves the old agent trace while recording the new evaluation.
