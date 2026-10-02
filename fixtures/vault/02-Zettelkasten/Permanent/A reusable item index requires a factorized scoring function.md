---
type: "permanent"
created: "2026-10-02"
source:
  - "[[In-batch negatives and sampling correction in neural retrieval]]"
  - "[[Sequential training and indexed serving in neural retrieval]]"
---

# A reusable item index requires a factorized scoring function

A precomputed item index is useful when the item representation can be calculated independently of the live query. A two-tower inner-product model provides that separation: the item tower prepares stored vectors, while the query tower produces a vector at request time.

Introducing arbitrary joint user-item computation into the indexed score would remove this property. Such interactions can instead be evaluated after candidate retrieval. [[Candidate coverage limits what a ranker can recover]] explains the corresponding limitation of that later stage.
