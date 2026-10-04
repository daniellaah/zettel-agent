---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Event-time and processing-time window semantics in Flink]]"
---

# Event freshness and processing delay describe different times

An event can be recent at its source yet delayed in the pipeline, or processed immediately after replaying old history. Its event timestamp and processing timestamp answer different questions. A feature-freshness measure should specify which interval it uses so that source age is not confused with execution latency.
