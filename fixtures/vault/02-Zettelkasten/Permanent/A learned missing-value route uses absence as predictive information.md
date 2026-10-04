---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Learned default directions for sparse tree inputs]]"
---

# A learned missing-value route uses absence as predictive information

Choosing a default branch from training data lets the tree exploit patterns associated with missingness. That can help prediction, but it also creates a dependence on how values become absent. If collection behavior changes, the route may no longer represent the same population; serving validation should include the missingness pattern as well as observed values.
