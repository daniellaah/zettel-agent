---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Moment estimation and bias correction in Adam]]"
  - "[[Momentum and optimization geometry]]"
---

# Optimizer state is part of an exact training continuation

Adam moments and momentum accumulators influence the next update even when current parameters and gradients are identical. Restoring weights alone therefore does not reproduce an exact continuation of the previous optimization process. A resumable training state includes the optimizer's history-dependent quantities. Inference can discard that state because it uses the fitted score rather than the learning update rule.
