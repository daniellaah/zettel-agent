---
type: "permanent"
created: "2026-10-02"
source:
  - "[[HNSW construction parameters and neighbor selection]]"
  - "[[Hierarchical search and insertion in HNSW]]"
---

# HNSW query tuning cannot replace construction quality

Query breadth controls how extensively HNSW explores an existing graph. Construction determines which edges are available to explore. These controls operate at different points in the lifecycle, so a graph with poor connectivity cannot be understood solely through its query parameter.

Tune insertion breadth, neighbor limits and query breadth with separate measurements of build cost, memory and recall. The distinction parallels [[Increasing IVF search breadth addresses pruning rather than quantization]]: a search-time control does not alter every source of approximation.
