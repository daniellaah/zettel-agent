---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Dynamic routing and target-selected training in ComiRec]]"
  - "[[Label-aware training and ANN serving in MIND]]"
---

# Hard interest assignment concentrates a target learning signal

Selecting the interest with the largest target score concentrates the target supervision on one representation instead of averaging every interest into the prediction. That creates competition among slots for explaining observations. It also makes slot utilization a separate question: multiple available vectors alone do not prove that all receive useful learning signals. Attention sharpness changes this allocation of supervision.
