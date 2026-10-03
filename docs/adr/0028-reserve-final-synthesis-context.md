# ADR-0028: Reserve input space for final synthesis

- Status: Accepted
- Date: 2026-10-02
- Refines: ADR-0026

The frozen live missing-evidence scenario reached 64,012 estimated input bytes
after seven requests. The 64,000-byte context allowance then prevented a final
answer. Late rejected tool expansions still added call/result wrappers and
thinking blocks, so the model could not explain what its search had failed to
establish. The original failure and HTTP traffic are retained unchanged.

Research now leaves a 4096-byte margin for paired results/control text and switches
to a tools-disabled synthesis when the selected request approaches that margin.
An output-budget rejection also ends research and reserves synthesis rather than
encouraging repeated expansions. All requested calls still receive a paired
result; saved history and signed/raw provider content remain append-only. Input,
tool and request caps are unchanged. A bounded final answer retains the
`budget_exhausted` status, distinguishing it from unrestricted completion.

This margin is conservative host accounting, not a provider tokenizer or a proof
that any arbitrarily large response fits. The existing hard context check remains
the final guard. An interrupted or intrinsically oversized turn may still need a
narrower question. The final control message requires gaps and failed queries to be disclosed, with
scoped absence in the opening/headings. Answers only cite actually delivered
evidence; ending research does not establish corpus-wide absence. A first targeted
rerun violated that scope before the stronger control message; it remains a
failed semantic sample despite a successful test-process exit.

Validation includes deterministic near-limit and rejected-expansion regressions,
free strict replay of unaffected live recordings and only an affected-scenario
live rerun. Earlier failed recordings are never edited to match the new loop.
