---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Term saturation and length scaling in BM25]]"
---

# BM25 frequency saturation limits the reward for repetition

Under BM25, additional occurrences of a term give diminishing increments rather than an indefinitely linear score increase. The saturation parameter adjusts that response, while the length parameter addresses a different effect. Separating these roles makes tuning interpretable: rewarding repeated query terms and compensating for long documents are related in the formula but remain distinct scoring decisions.
