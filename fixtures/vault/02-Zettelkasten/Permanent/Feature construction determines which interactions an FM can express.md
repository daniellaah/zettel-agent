---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Prediction tasks and input design for factorization machines]]"
  - "[[Pairwise interaction parameters in factorization machines]]"
---

# Feature construction determines which interactions an FM can express

An FM learns interactions among features present in its input. User and item identifiers expose user-item interactions; adding context creates additional pairs involving that context. The model cannot learn a relationship involving information never encoded in the feature vector. Its automatic pairwise interaction mechanism reduces manual coefficient design, while leaving the choice and availability of input information consequential.
