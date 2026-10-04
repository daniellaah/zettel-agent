---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Shared item embeddings and asymmetric transitions in SASRec]]"
---

# Shared embeddings do not force symmetric recommendation scores

Symmetry of a raw embedding inner product does not imply symmetry after a history-dependent transformation. The query representation can change with item order and nonlinear computation even when input and output items share parameters. Assessing transition expressiveness therefore requires examining the complete scoring function, not only whether the embedding table is tied.
