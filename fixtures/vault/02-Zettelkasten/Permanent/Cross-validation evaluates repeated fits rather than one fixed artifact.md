---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Rotating held-out folds in cross-validation]]"
---

# Cross-validation evaluates repeated fits rather than one fixed artifact

Each fold fits a different model on a different training subset. The averaged error estimates the fitting procedure under those partitions rather than directly measuring the final model trained on all observations. This distinction matters when describing what a reported cross-validation score certifies about a deployed artifact.
