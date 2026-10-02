---
type: "literature"
created: "2026-10-02"
source_title: "Apache Flink documentation"
author: "Apache Software Foundation"
year: ""
source: "Apache Flink documentation"
---

# Event-time and processing-time window semantics in Flink

Processing-time operations use the executing machine's clock, so a window includes records according to when an operator processes them. Event-time operations use timestamps attached to the events, and time advances through watermarks. The documentation explains that processing-time results depend on arrival and execution delays, while event-time processing can reproduce results for out-of-order or historical data when the necessary records are available. Finite waiting limits the handling of delayed events.
