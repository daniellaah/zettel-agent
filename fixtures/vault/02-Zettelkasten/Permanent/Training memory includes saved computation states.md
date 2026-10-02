---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Backpropagation through a computational graph]]"
---

# Training memory includes saved computation states

Parameters are only one part of the memory required for training. Reverse differentiation also needs intermediate quantities from the forward computation or a way to recompute them. Memory planning therefore depends on batch shape and computation structure in addition to parameter count. A model that fits for inference may exceed memory during training even before optimizer state is considered.
