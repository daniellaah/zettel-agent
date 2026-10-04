---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Temporal labels and user weighting in YouTube retrieval]]"
---

# Equal user sampling changes whose errors dominate training

Sampling a fixed number of examples per user reduces the influence of users who generate many interactions. It changes the weighting of the learning problem toward users rather than toward the raw event population. This is an objective choice, not merely a way to make training data smaller.

When reporting improvements, identify whether the metric and loss are aggregated by events or by users. Their populations need not reward the same changes, even with identical model architecture.
