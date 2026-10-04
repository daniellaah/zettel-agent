---
type: "literature"
created: "2026-10-02"
source_title: "Factorization Machines"
author: "Steffen Rendle"
year: "2010"
source: "Factorization Machines"
---

# Linear-time evaluation of factorization-machine interactions

The pairwise interaction sum in a second-order factorization machine can be rearranged into squared sums of feature-factor products minus their squared individual terms. This avoids explicitly enumerating every feature pair. Prediction has complexity linear in both feature count and factor dimension. For sparse feature vectors, the sums need only traverse nonzero values, so the cost depends on active features rather than the full vocabulary of possible features.
