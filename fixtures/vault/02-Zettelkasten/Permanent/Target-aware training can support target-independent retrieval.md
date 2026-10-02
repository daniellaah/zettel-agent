---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Label-aware training and ANN serving in MIND]]"
---

# Target-aware training can support target-independent retrieval

A training target can determine which user interest receives the learning signal while the serving model still computes interests solely from observed history. The target guides supervision rather than becoming a required serving input. This distinction explains why target-aware training can coexist with [[A reusable item index requires a factorized scoring function]]: the exported user and item representations remain independently computable.
