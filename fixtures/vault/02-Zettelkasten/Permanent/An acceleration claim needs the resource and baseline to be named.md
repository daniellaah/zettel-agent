---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Arithmetic memory and IO bounds in FlashAttention]]"
  - "[[Acceptance cost and lookahead in speculative speedup]]"
---

# An acceleration claim needs the resource and baseline to be named

Memory traffic, total arithmetic, per-request latency, and serving throughput can move differently under an optimization. A useful speedup statement specifies the baseline implementation, workload, and measured resource. FlashAttention and speculative decoding illustrate why reducing one bottleneck can improve latency without uniformly reducing every form of computational work.
