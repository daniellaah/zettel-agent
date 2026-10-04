---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Ridge penalties and coefficient shrinkage]]"
  - "[[Capacity and generalization in supervised learning]]"
---

# Shrinkage can improve prediction while worsening training fit

Constraining coefficients can increase residual error on the training sample while reducing sensitivity to its particular observations. The useful comparison is expected performance on new data. A regularized model can therefore be preferable even when an unconstrained fit wins on the training objective; the penalty changes the tradeoff rather than guaranteeing an improvement.
