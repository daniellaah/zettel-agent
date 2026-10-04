---
type: "literature"
created: "2026-10-02"
source_title: "Apache Flink documentation"
author: "Apache Software Foundation"
year: ""
source: "Apache Flink documentation"
---

# Keyed state partitioning and redistribution in Flink

Flink partitions keyed state together with its keyed input stream. An operator accesses the state associated with the current event's key, keeping updates local to that key partition. State is organized into key groups, which are the atomic units of redistribution when parallelism changes. The documentation states that the number of key groups is set by the configured maximum parallelism.
