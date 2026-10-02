---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Training-serving skew comparisons in Rules of ML]]"
---

# Training-serving skew has several distinct causes

A generalization gap, temporal distribution change, and inconsistent feature computation can all produce poorer live performance. They require different remedies. Regularization may address one gap while leaving an engineering mismatch untouched. Diagnosing skew therefore starts by specifying which data and execution environments are being compared, rather than treating every offline-to-online discrepancy as evidence that the model needs more capacity.
