---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Rotating held-out folds in cross-validation]]"
  - "[[Predictor scaling before ridge regression]]"
---

# Preprocessing must respect the held-out fold boundary

Scaling statistics estimated from the full dataset let validation observations influence the fitted transformation. To preserve the held-out comparison, each training fold should determine its own preprocessing parameters before transforming that fold's validation examples. The evaluated object is the entire learning pipeline, including data-dependent transformations.
