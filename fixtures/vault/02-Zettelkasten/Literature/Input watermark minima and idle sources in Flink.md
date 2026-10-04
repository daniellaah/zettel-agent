---
type: "literature"
created: "2026-10-02"
source_title: "Apache Flink documentation"
author: "Apache Software Foundation"
year: ""
source: "Apache Flink documentation"
---

# Input watermark minima and idle sources in Flink

Parallel source partitions can generate watermarks independently. An operator with several inputs advances its event time according to the minimum input watermark. The documentation explains that a partition without events may stop advancing its watermark and hold back active partitions. A watermark strategy can detect such idleness and mark that input idle so it no longer blocks the minimum in the same way.
