---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Regularized split gain in XGBoost]]"
  - "[[Second-order leaf optimization in XGBoost]]"
---

# A split criterion inherits the loss and regularization used to derive it

Gradient and Hessian sums describe the current objective, not a universal measure of feature quality. Changing the loss, weights, or regularization changes which split looks useful. A high gain is evidence about improvement under those fitting choices and should not be described as an objective-independent property of the feature.
