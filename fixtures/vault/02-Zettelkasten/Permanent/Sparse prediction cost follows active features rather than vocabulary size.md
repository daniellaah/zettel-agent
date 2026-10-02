---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Linear-time evaluation of factorization-machine interactions]]"
---

# Sparse prediction cost follows active features rather than vocabulary size

A large feature vocabulary does not imply that every feature contributes to each FM prediction. Sparse inputs restrict arithmetic to the active feature factors. Vocabulary size still affects parameter storage, while active-feature count affects per-example computation. Separating these two dimensions makes resource estimates clearer and avoids treating a very wide sparse representation as though every example were dense.
