---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Behavior-to-interest routing in MIND]]"
  - "[[Dynamic routing and target-selected training in ComiRec]]"
---

# Routing symmetry depends on transformation sharing

Identical initialization becomes problematic when all interest slots also share the same transformation: identical assignments can preserve identical outputs. Randomized logits break that symmetry in MIND. Distinct transformation matrices offer another source of differentiation in ComiRec-DR. Initialization cannot be assessed independently of parameter sharing; copying one routing component without the other can change the mechanism that keeps interest slots distinct.
