---
type: "literature"
created: "2026-10-02"
source_title: "Apache Flink documentation"
author: "Apache Software Foundation"
year: ""
source: "Apache Flink documentation"
---

# Checkpoint state and source replay in Flink

A Flink checkpoint records source positions together with operator state for a consistent point in the dataflow. On failure, the system restores a completed checkpoint and resumes the input streams from the recorded positions. The documentation describes this combination of state restoration and replay as maintaining exactly-once processing semantics. Sources must support rewinding to the required point, and checkpoint frequency trades runtime overhead against replay work during recovery.
