---
type: "permanent"
created: "2026-10-02"
source:
  - "[[HNSW complexity assumptions and graph memory]]"
---

# HNSW logarithmic scaling is a qualified performance claim

HNSW's favorable search scaling should be described with the assumptions and evidence attached to it. Analysis using idealized Delaunay graphs does not establish an unconditional guarantee for every approximate graph, dimensionality or data distribution.

For deployment, measure latency and recall as the intended corpus grows, using the intended embeddings. Treat the paper's empirical results as evidence for the studied conditions rather than as a promise that the same complexity holds for every future workload.
