---
type: "literature"
created: "2026-10-02"
source_title: "Controllable Multi-Interest Framework for Recommendation"
author: "Yukuo Cen et al."
year: "2020"
source: "Controllable Multi-Interest Framework for Recommendation"
---

# Dynamic routing and target-selected training in ComiRec

ComiRec-DR uses capsule routing with distinct transformation matrices for behavior-to-interest pairs and initializes routing logits to zero. Iterations update coupling weights, compute squashed interest vectors, and increase agreement with transformed behavior vectors. For training either ComiRec variant, the target item selects the interest vector with the largest inner product. This selected vector is used in the sampled-softmax objective. The paper contrasts its routing design with MIND's shared transformation and randomized initialization.
