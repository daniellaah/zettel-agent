---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Keyed state partitioning and redistribution in Flink]]"
---

# A hot key can remain a bottleneck after adding stream workers

Keyed state follows the partition owning that key. Redistributing key groups can spread many keys across more workers, but it does not automatically divide one key's updates among independent owners. A workload dominated by one key may therefore require a different aggregation design rather than only increased parallelism.
