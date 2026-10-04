---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Dependencies introduced by correction cascades]]"
---

# Component accuracy is insufficient for evaluating a correction cascade

A correction model adapts to the errors of its upstream model. Improving that upstream model can change the correction inputs and undermine the combined behavior. Evaluating only the changed component misses this dependence. The system-level prediction must be checked after an update, and the correction structure itself may deserve reconsideration when it makes improvements difficult to propagate.
