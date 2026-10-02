---
type: "literature"
created: "2026-10-02"
source_title: "Factorization Machines"
author: "Steffen Rendle"
year: "2010"
source: "Factorization Machines"
---

# Shared interaction evidence under sparse observations

The factorization-machine paper explains that independently estimating every interaction is difficult when few training examples contain a given feature pair. Factorized interactions share feature vectors across pairs, allowing observations of related interactions to influence an unobserved pair's estimated coefficient. The paper recommends restricting factor dimensionality in sparse settings because the available observations may not support a highly expressive interaction model. Its example follows shared user and item factors across movie-rating observations.
