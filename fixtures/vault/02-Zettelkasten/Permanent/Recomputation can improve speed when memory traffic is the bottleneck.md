---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Backward recomputation in FlashAttention]]"
---

# Recomputation can improve speed when memory traffic is the bottleneck

Recomputing an intermediate adds arithmetic but can avoid transferring a large saved tensor through slower memory. Whether that exchange helps depends on the hardware and workload. The useful optimization target is the limiting resource on the execution path, so a smaller FLOP count alone does not establish lower latency.
