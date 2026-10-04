---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Input watermark minima and idle sources in Flink]]"
  - "[[Allowed lateness and repeated window firing in Flink]]"
---

# Ignoring an idle input trades a blocking risk for a lateness assumption

Marking a partition idle lets active inputs advance event time. If that partition later resumes with old timestamps, those records can meet a downstream clock that has already advanced. Idleness handling should therefore be chosen together with the late-data policy, rather than viewed only as a throughput adjustment.
