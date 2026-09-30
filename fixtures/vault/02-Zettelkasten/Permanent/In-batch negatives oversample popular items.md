---
type: permanent
created: 2026-05-06
tags: [recsys, negative-sampling, retrieval]
aliases: [in-batch 负采样, batch negatives]
source: "[[Lit - Yi 2019 Sampling-Bias-Corrected Retrieval]]"
---
# In-batch negatives oversample popular items

When training a retrieval model with a sampled softmax, the cheap trick is to reuse the other positives in the same mini-batch as negatives. No extra lookups, no separate sampler, and the negatives are "real" items that users actually engaged with.

The catch: an item shows up in a batch in proportion to how often it is clicked. Popular items are therefore used as negatives far more often than their share of the catalog would suggest. The model learns to push them down — the opposite of what the logged clicks say — and the effect grows with batch size.

In practice this looks like head-item recall dropping while tail recall creeps up. Mixing in a handful of uniformly sampled negatives softens the problem but does not remove it, because most of the negative mass still comes from the batch.

## Links
- Fixed by [[LogQ 校正抵消采样偏差]]: subtracting the log of each item's sampling probability undoes the popularity skew.
