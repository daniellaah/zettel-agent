---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Issue and pull-request construction of SWE-bench tasks]]"
  - "[[Patch application and regression tests in SWE-bench grading]]"
---

# A reference solution is evidence of solvability rather than the only valid output

A known patch that changes failing tests to passing demonstrates one solution under the task conditions. Another patch may satisfy the same behavioral requirements with different edits. Grading should preserve those requirements rather than demanding textual equality with the reference, while retaining regression and execution checks that define the accepted behavior.
