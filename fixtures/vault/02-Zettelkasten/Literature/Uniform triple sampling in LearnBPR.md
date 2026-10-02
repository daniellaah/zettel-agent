---
type: "literature"
created: "2026-10-02"
source_title: "BPR: Bayesian Personalized Ranking from Implicit Feedback"
author: "Steffen Rendle, Christoph Freudenthaler, Zeno Gantner, Lars Schmidt-Thieme"
year: "2009"
source: "BPR: Bayesian Personalized Ranking from Implicit Feedback"
---

# Uniform triple sampling in LearnBPR

LearnBPR updates model parameters from randomly sampled training triples rather than repeatedly traversing all item comparisons in user or item order. The paper recommends uniform sampling with replacement to avoid long consecutive runs of updates for the same user-item combination. Sampling permits stopping after any number of updates without completing a full pass through the potentially very large triple set.
