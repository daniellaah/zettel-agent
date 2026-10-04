---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Checkpoint state and source replay in Flink]]"
---

# A recovery point couples input positions with operator state

Restoring state from one point while replaying inputs from another can omit updates or apply them twice. A consistent recovery point must preserve their relationship. Exactly-once state evolution can include physically re-executing records after a failure; the relevant guarantee concerns the restored computation, while external side effects require their own connector guarantees.
