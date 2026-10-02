---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Item-neighborhood prediction in item-based collaborative filtering]]"
  - "[[Precomputed item neighborhoods for scalable prediction]]"
---

# A cached neighborhood separates similarity construction from prediction

An item neighborhood can be computed before the active user requests a prediction. Serving then combines that reusable neighborhood with the user ratings available at request time. This separates a shared construction cost from personalized scoring. Model freshness remains a separate decision: precomputation reduces repeated work, but a cached neighborhood reflects the interactions used when it was built.
