---
type: "literature"
created: "2026-10-02"
source_title: "Factorization Machines"
author: "Steffen Rendle"
year: "2010"
source: "Factorization Machines"
---

# Pairwise interaction parameters in factorization machines

A second-order factorization machine combines a global bias, linear feature terms, and pairwise feature interactions. Each feature has a latent factor vector, and the coefficient for a pair is the inner product of its two factor vectors. The interaction term also multiplies the corresponding feature values. Factor dimensionality is a model hyperparameter; the model does not allocate an independently learned coefficient to every feature pair.
