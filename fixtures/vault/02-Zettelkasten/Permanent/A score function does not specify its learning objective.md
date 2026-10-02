---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Prediction tasks and input design for factorization machines]]"
---

# A score function does not specify its learning objective

The same factorization-machine score can support numerical regression, classification, or pairwise ranking. These tasks impose different losses and meanings on the fitted score. Naming the architecture alone therefore leaves the prediction contract incomplete. An explanation should connect the score, target construction, and optimization objective before interpreting model outputs as probabilities, ratings, or ranking evidence.
