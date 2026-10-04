---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Sampled candidate evaluation in SASRec]]"
---

# Sampled candidate metrics describe the sampled ranking problem

Ranking one relevant item among one hundred sampled alternatives tests a different competition from searching the full catalog. The metric depends on how those alternatives were chosen. A sampled Hit@10 result should retain its candidate protocol when reported and cannot directly certify full-catalog recall under an ANN serving pipeline.
