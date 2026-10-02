---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Candidate generation and ranking at YouTube]]"
---

# Candidate coverage limits what a ranker can recover

A ranker can improve the ordering only of candidates supplied to it. If retrieval excludes a relevant item, even a perfect scoring function in the ranking stage cannot select that item. Candidate coverage therefore places an upper bound on what downstream ranking can achieve.

This makes stage-specific diagnosis useful: first check whether useful items entered the candidate set, then examine their ordering. [[ANN approximation adds a separate source of retrieval loss]] identifies another boundary within the retrieval stage itself.
