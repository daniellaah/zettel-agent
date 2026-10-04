---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Watch-time weighting in YouTube ranking]]"
---

# Watch-time-weighted logistic scores need an explicit probability assumption

Weighting clicked impressions by watch time changes the quantity estimated by a logistic model. Interpreting its odds as expected watch time relies on an approximation that becomes suitable when click probability is small. The scoring interpretation therefore includes an assumption about the data regime.

A sound explanation should state that assumption before presenting the score as a business quantity. The same weighting scheme applied in a different click regime would require revisiting the approximation rather than reusing the interpretation automatically.
