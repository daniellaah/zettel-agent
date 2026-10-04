---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Sampled candidate evaluation in SASRec]]"
  - "[[Sequence evaluation protocol in ComiRec]]"
---

# Ranking comparisons require the same candidate protocol

A change in candidate difficulty can move a ranking metric without improving the model. Comparisons need compatible target definitions, candidate construction, cutoffs, and user weighting. Recording those choices is necessary to interpret differences between paper results or local experiments, even when both reports use a metric called recall or NDCG.
