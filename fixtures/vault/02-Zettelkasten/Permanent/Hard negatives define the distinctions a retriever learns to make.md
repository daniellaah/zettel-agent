---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Negative passage selection in DPR]]"
---

# Hard negatives define the distinctions a retriever learns to make

Random passages often differ visibly from a positive, while high-ranked lexical negatives can share many query terms. The negative selection rule therefore shapes which distinctions receive a training signal. Reusing batch positives makes computation efficient, but it does not automatically provide the same learning problem as lexically confusable negatives. Training comparisons should describe both the sampler and the objective.
