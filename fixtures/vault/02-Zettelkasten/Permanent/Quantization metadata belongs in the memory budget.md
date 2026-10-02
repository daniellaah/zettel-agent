---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Double quantization of blockwise scaling constants]]"
---

# Quantization metadata belongs in the memory budget

Blockwise quantization needs scales or other constants in addition to the weight codes. For small blocks, this metadata can make a noticeable contribution to storage. Double quantization targets that contribution rather than reducing the weight code width again. A realistic compression estimate therefore includes codes, metadata, and any remaining higher-precision tensors instead of multiplying parameter count by nominal bits alone.
