---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Batching and memory tiling in GPU similarity search]]"
---

# GPU search throughput must be interpreted with its batch size

Batching allows several similarity queries to share efficient matrix operations and GPU parallelism. A throughput result measured under that workload does not directly specify the latency of one isolated request. Request arrival patterns and available batching opportunities matter when transferring a benchmark to a service.

Record both the query batch size and the latency measurement boundary when comparing implementations. A faster arithmetic kernel is useful only insofar as the surrounding workload can use it without unacceptable waiting or transfer costs.
