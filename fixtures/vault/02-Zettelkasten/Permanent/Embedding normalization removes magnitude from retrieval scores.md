---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Sequential training and indexed serving in neural retrieval]]"
---

# Embedding normalization removes magnitude from retrieval scores

For unit-normalized query and item embeddings, their inner product measures directional agreement. Vector magnitude no longer gives an item an additional score advantage. Normalization therefore changes the information available to the scoring function, rather than serving only as a numerical convenience.

Training, index construction and query serving should apply compatible normalization conventions. Otherwise the model can be optimized for one geometry and queried in another, undermining the score interpretation described in [[A reusable item index requires a factorized scoring function]].
