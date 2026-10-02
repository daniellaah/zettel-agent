---
type: "literature"
created: "2026-10-02"
source_title: "Billion-scale similarity search with GPUs"
author: "Jeff Johnson, Matthijs Douze, Hervé Jégou"
year: "2017"
source: "Billion-scale similarity search with GPUs"
---

# Batching and memory tiling in GPU similarity search

Faiss processes several queries in parallel to make effective use of GPU computation. For exact search, matrix multiplication computes the main distance terms, and a fused selection kernel adds the remaining database-vector term while retaining the nearest results.

The full distance matrix can exceed GPU memory. The implementation therefore tiles computation over queries or database vectors and overlaps work through streams. In IVFADC, inverted-list scans likewise produce partial results that are reduced to the final nearest neighbors. The paper treats intermediate storage and selection as important implementation costs alongside distance arithmetic.
