---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Storage and computation precision in QLoRA]]"
---

# Four-bit weight storage does not mean four-bit arithmetic everywhere

QLoRA separates compact weight storage from the higher-precision operations used after dequantization. Describing it only as four-bit training hides that distinction. Adapter parameters, matrix computation, activations, and optimizer state have their own representations. The relevant precision contract is component-specific, which matters when explaining both the memory savings and the numerical work actually performed.
