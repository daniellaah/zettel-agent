---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Simple models and independent infrastructure tests]]"
---

# A simple baseline can validate the prediction pipeline

A simple model makes failures in data delivery and serving easier to distinguish from failures in model expressiveness. Its value includes establishing an executable prediction contract, not just an accuracy reference. Once the same inputs reliably reach training and serving, richer models can be compared against a baseline whose behavior is understood. Complexity introduced before that point adds alternative explanations for every observed discrepancy.
