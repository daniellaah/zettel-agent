---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Item-neighborhood prediction in item-based collaborative filtering]]"
  - "[[Pairwise interaction parameters in factorization machines]]"
---

# Neighborhood similarity and learned interaction coefficients are different quantities

A neighborhood similarity summarizes relationships between item interaction patterns. An FM interaction coefficient is learned as part of predicting a target from feature pairs. Both can appear in recommender systems, but they arise from different computations and objectives. Replacing one with the other changes the meaning of the score even when the resulting values are both used to rank items.
