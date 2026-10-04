---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Blockwise softmax accumulation in FlashAttention]]"
---

# Exact attention equivalence does not require identical floating-point execution

A blockwise algorithm can compute the same mathematical attention expression while changing reduction order and intermediate rounding. Exactness in this sense concerns the absence of an attention approximation, not a promise of bitwise identity across implementations. Numerical verification should use tolerances appropriate to dtype and operation order.
