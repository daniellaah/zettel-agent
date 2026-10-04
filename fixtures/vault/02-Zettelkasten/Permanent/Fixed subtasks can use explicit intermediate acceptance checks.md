---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Prompt chaining and intermediate gates]]"
---

# Fixed subtasks can use explicit intermediate acceptance checks

When a task has known stages, a gate can check an intermediate artifact before later work builds on it. This catches structural failures at the boundary where they become relevant. The benefit depends on whether the check measures a real requirement. A gate that accepts every fluent output adds process overhead without improving the reliability of the downstream dependency.
