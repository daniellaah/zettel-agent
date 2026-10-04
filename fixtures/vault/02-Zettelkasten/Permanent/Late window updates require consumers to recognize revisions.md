---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Allowed lateness and repeated window firing in Flink]]"
---

# Late window updates require consumers to recognize revisions

A second firing for the same logical window can revise an earlier aggregate. A downstream consumer that treats every firing as a new independent total can double-count evidence. The output contract needs a way to associate updates with their window and apply replacement or other explicitly defined revision semantics.
