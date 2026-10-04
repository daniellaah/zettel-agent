---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Predictor scaling before ridge regression]]"
---

# Regularization strength is meaningful only relative to the feature representation

A numeric penalty cannot be interpreted independently of measurement units. Rescaling one feature changes the coefficient size needed for the same predictive contribution and therefore changes its penalty cost. Comparing regularization settings across pipelines requires accounting for the transformations applied before fitting.
