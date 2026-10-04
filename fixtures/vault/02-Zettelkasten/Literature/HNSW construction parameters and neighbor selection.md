---
type: "literature"
created: "2026-10-02"
source_title: "Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs"
author: "Yu. A. Malkov, D. A. Yashunin"
year: "2016"
source: "Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs"
---

# HNSW construction parameters and neighbor selection

HNSW separates the breadth of insertion search from that of query search. During construction, efConstruction controls the candidate search used to establish connections. M controls the number of selected neighbors, subject to layer-specific limits.

The paper compares simply choosing the closest neighbors with a heuristic that also considers distances among candidate neighbors. The heuristic creates connections in different directions and is particularly useful in clustered data, where purely local neighbors can trap search at cluster boundaries. Construction choices therefore affect the connectivity available to later queries, rather than merely increasing the amount of insertion work.
