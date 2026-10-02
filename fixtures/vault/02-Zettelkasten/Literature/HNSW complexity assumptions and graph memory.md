---
type: "literature"
created: "2026-10-02"
source_title: "Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs"
author: "Yu. A. Malkov, D. A. Yashunin"
year: "2016"
source: "Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs"
---

# HNSW complexity assumptions and graph memory

The paper analyzes logarithmic search scaling under assumptions involving exact Delaunay graphs and bounded average degree. HNSW instead uses approximate neighbor selection with fixed connection limits. Low-dimensional experiments support favorable scaling, but the authors state that further analytical evidence is needed to establish the same resilience in higher dimensions.

Graph connections account for substantial index memory. Their cost depends on the allowed links at the ground layer, the upper-layer limits and the distribution of element levels. This connection storage is additional to the memory occupied by the underlying vectors.
