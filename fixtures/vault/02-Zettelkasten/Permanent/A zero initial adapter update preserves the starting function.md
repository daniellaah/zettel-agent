---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Frozen weights and low-rank updates in LoRA]]"
---

# A zero initial adapter update preserves the starting function

Initializing one LoRA factor to zero makes their product zero even though the other factor is random. The adapted layer therefore starts with the pretrained output and gains a trainable update during optimization. This initialization gives a functional starting-point guarantee. It does not mean both factors should be zero, because their gradient paths depend on the other factor's values.
