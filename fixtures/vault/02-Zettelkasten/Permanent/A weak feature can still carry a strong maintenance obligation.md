---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Underutilized feature dependencies]]"
---

# A weak feature can still carry a strong maintenance obligation

A feature with negligible incremental predictive value can still tie a model to an upstream pipeline, owner, or identifier scheme. Removing it can simplify future migrations even when immediate accuracy barely changes. Feature selection therefore has an operational dimension in addition to predictive value. The relevant comparison includes dependency cost, not just whether the feature receives a nonzero learned weight.
