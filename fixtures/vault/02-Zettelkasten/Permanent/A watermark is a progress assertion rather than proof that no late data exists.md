---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Input watermark minima and idle sources in Flink]]"
  - "[[Allowed lateness and repeated window firing in Flink]]"
---

# A watermark is a progress assertion rather than proof that no late data exists

Advancing a watermark enables a computation to proceed under a lateness policy. It does not physically prevent delayed records from arriving afterward. Correct interpretation of an emitted window result therefore includes the watermark-generation assumptions and the operator's policy for accepting, revising, or discarding later evidence.
