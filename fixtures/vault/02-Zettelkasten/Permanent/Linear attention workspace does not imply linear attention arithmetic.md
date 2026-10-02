---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Arithmetic memory and IO bounds in FlashAttention]]"
---

# Linear attention workspace does not imply linear attention arithmetic

Avoiding the full attention matrix removes a quadratic intermediate storage requirement without removing all query-key comparisons. FlashAttention therefore distinguishes auxiliary memory from arithmetic complexity. A claim that the algorithm makes exact dense attention linear-time confuses those resources and gives the wrong expectation for long-sequence scaling.
