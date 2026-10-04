---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Momentum and optimization geometry]]"
---

# A noisy gradient can still contain a consistent direction

Stochastic gradients can vary between minibatches while sharing a useful average direction. Momentum accumulates recent gradients so that consistent components persist and alternating components partly cancel. This gives a reason for considering history in the update rule. It does not guarantee improvement for every objective or momentum coefficient, because the accumulated direction can also lag changes in local geometry.
