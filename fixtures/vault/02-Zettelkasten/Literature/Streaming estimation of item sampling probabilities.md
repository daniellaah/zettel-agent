---
type: "literature"
created: "2026-10-02"
source_title: "Sampling-Bias-Corrected Neural Modeling for Large Corpus Item Recommendations"
author: "Xinyang Yi et al."
year: "2019"
source: "Sampling-Bias-Corrected Neural Modeling for Large Corpus Item Recommendations"
---

# Streaming estimation of item sampling probabilities

The frequency estimator tracks the gap in global training steps between successive appearances of an item. A moving average estimates the mean gap, and its reciprocal estimates the item's batch sampling probability. Hash arrays store the latest occurrence and estimated gap without allocating a permanent entry for every item identifier.

Hash collisions combine appearances of different items and can overestimate frequency. The improved estimator maintains several independent hashings and uses the largest estimated gap. The global-step representation supports distributed parameter-server updates, while the moving average allows the estimate to adapt as the stream changes.
