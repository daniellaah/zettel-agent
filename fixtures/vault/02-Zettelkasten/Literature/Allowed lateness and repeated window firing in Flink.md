---
type: "literature"
created: "2026-10-02"
source_title: "Apache Flink documentation"
author: "Apache Software Foundation"
year: ""
source: "Apache Flink documentation"
---

# Allowed lateness and repeated window firing in Flink

For event-time windows, Flink can retain state after the watermark passes the window end for a configured allowed-lateness interval. Late elements within that interval are added to the window and can cause another firing under the event-time trigger. After the interval expires, the window state is removed and further late elements are dropped under the default handling. The documented allowed-lateness default is zero.
