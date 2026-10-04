---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Linear-time evaluation of factorization-machine interactions]]"
---

# Fast interaction evaluation does not remove the interaction model

Rearranging the factorized pairwise sum changes how the score is computed without changing which second-order interactions the model represents. Linear-time evaluation is an algebraic property of shared factors, not an omission of all but a few pairs. This distinction matters when explaining why a sparse feature model can represent many interactions while avoiding explicit quadratic enumeration at prediction time.
