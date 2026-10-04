---
type: "literature"
created: "2026-10-02"
source_title: "BPR: Bayesian Personalized Ranking from Implicit Feedback"
author: "Steffen Rendle, Christoph Freudenthaler, Zeno Gantner, Lars Schmidt-Thieme"
year: "2009"
source: "BPR: Bayesian Personalized Ranking from Implicit Feedback"
---

# Observed and unobserved item comparisons in BPR

Implicit-feedback observations contain positive interactions, while unobserved user-item pairs mix missing and negative feedback. BPR constructs training triples from a user, an observed item, and an unobserved item, assuming the observed item is preferred. The paper does not infer an ordering between two observed items or between two unobserved items. Its supervision is therefore a partial set of pairwise preferences derived from the interaction data.
