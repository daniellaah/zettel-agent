---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Frozen weights and low-rank updates in LoRA]]"
  - "[[LoRA merging and adapter storage]]"
---

# Parameter-efficient training still needs the base model computation

Training fewer parameters reduces update and optimizer-state requirements, but the forward computation still passes through the base model. Gradients for the adapters also depend on those computations. A small trainable-parameter count therefore does not imply proportionally small total compute or memory. Resource estimates should distinguish the adaptation state from the underlying model and saved activations.
