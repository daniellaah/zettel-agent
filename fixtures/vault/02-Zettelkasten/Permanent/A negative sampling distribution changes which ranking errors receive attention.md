---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Uniform triple sampling in LearnBPR]]"
  - "[[Observed and unobserved item comparisons in BPR]]"
---

# A negative sampling distribution changes which ranking errors receive attention

The sampler determines how often each observed-versus-unobserved comparison contributes an update. Replacing uniform triple sampling with a different scheme changes that weighting unless compensated. A harder or more popular negative set can change the effective learning problem, so the sampler belongs in the description of the objective being optimized.
