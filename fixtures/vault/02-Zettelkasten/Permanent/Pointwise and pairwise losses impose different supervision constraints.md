---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Sampled binary next-item training in SASRec]]"
  - "[[Pairwise logistic likelihood and priors in BPR]]"
---

# Pointwise and pairwise losses impose different supervision constraints

A sampled binary objective pushes individual positive and negative scores toward separate labels. A pairwise objective constrains their difference. These losses can act on the same score architecture while defining different fitting problems; choosing between them requires understanding the observations and prediction event rather than treating the architectures as the entire method.
