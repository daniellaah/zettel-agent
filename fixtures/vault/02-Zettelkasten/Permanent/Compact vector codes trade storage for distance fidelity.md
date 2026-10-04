---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Product quantization and asymmetric distance computation]]"
---

# Compact vector codes trade storage for distance fidelity

Product quantization stores a codebook assignment for each vector component group instead of retaining all original floating-point values. This saves per-vector storage, but distance computation now measures the query against a quantized representation. Close candidates can change order when their approximation errors differ.

The relevant trade-off includes recall and memory together. Code size alone cannot establish whether an index is suitable for a task, because relevance depends on which score distinctions the compression preserves.
