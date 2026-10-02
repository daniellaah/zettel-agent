---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Validation-based early stopping]]"
---

# Early stopping selects a point on the optimization trajectory

Early stopping changes which learned parameters are returned by selecting a checkpoint before further fitting damages validation performance. It does not require a change to the model architecture or an explicit norm penalty. Training duration becomes part of the effective regularization procedure. Comparing runs therefore requires considering checkpoint selection as well as the number of optimization steps performed.
