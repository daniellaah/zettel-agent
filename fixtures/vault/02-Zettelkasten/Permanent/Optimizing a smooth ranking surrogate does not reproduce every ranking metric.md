---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Pairwise logistic likelihood and priors in BPR]]"
  - "[[Sampled candidate evaluation in SASRec]]"
---

# Optimizing a smooth ranking surrogate does not reproduce every ranking metric

A differentiable pairwise loss rewards margins over selected comparisons, while a top-K metric emphasizes the ordering near a cutoff. Their weighting and treatment of score differences need not agree. Improvement in the surrogate is useful training evidence, but deployment relevance must still be measured under the intended candidate set and ranking metric.
