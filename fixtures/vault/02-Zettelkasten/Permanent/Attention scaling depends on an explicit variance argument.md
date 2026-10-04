---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Scaled dot-product attention]]"
---

# Attention scaling depends on an explicit variance argument

Dividing dot products by the square root of key dimension is motivated by a variance calculation under assumptions about the components. The operation controls the scale entering softmax, rather than normalizing each vector to unit length. This differs from [[Embedding normalization removes magnitude from retrieval scores]]. Both affect dot-product behavior, but they modify different quantities and should not be explained interchangeably.
