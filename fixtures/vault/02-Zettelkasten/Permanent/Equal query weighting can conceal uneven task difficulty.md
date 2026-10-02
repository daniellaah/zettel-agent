---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Average precision and graded ranking evaluation]]"
---

# Equal query weighting can conceal uneven task difficulty

An arithmetic mean over query-level scores gives each query equal weight, regardless of how many relevant documents it has. This is a deliberate aggregation choice, not a property of the corpus itself. Per-query inspection can reveal failures hidden by the mean. It parallels [[Per-user recall gives users equal weight rather than interactions]], with information needs replacing users as the unit of aggregation.
