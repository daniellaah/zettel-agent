---
type: "permanent"
created: "2026-10-02"
source:
  - "[[In-batch negatives and sampling correction in neural retrieval]]"
---

# Sharing negatives changes the training compute pattern

In-batch training reuses the item representations computed for the current positive pairs. Each query is compared with the batch's item vectors, so the same item encoding supplies alternatives for several queries. The saving comes from sharing representation computation rather than avoiding query-item comparisons altogether.

Batch size consequently affects both the set of alternatives and the size of the score matrix. The modeling effect of larger batches and the memory cost of those comparisons should be considered separately.
