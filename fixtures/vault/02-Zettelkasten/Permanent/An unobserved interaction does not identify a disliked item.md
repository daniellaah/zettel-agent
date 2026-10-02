---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Observed and unobserved item comparisons in BPR]]"
  - "[[Ranking exposure and positional features in Rules of ML]]"
---

# An unobserved interaction does not identify a disliked item

An item may be unobserved because the user never saw it, because observation was incomplete, or because the user declined it. Those cases share a missing interaction label but differ in interpretation. Learning from unobserved candidates therefore requires an explicit supervision assumption rather than treating missingness as a directly measured dislike.
