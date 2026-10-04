---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Frozen weights and low-rank updates in LoRA]]"
---

# LoRA constrains the update rank rather than the base-weight rank

A pretrained matrix can remain full-rank while its task adaptation is represented by a low-rank increment. LoRA imposes the constraint on the change, not on the stored base transformation. This distinction explains how a compact adaptation can preserve a large model's original representation while restricting the additional degrees of freedom available for learning the new task.
