---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Backpropagation through a computational graph]]"
  - "[[Moment estimation and bias correction in Adam]]"
---

# Backpropagation computes derivatives rather than choosing updates

Backpropagation determines how the objective changes with model parameters through the computation graph. An optimizer then chooses an update using those gradients and possibly additional state. Adam and momentum alter the update rule without replacing the chain rule. Separating these roles makes it easier to locate a problem in derivative computation, objective definition, or optimization behavior.
