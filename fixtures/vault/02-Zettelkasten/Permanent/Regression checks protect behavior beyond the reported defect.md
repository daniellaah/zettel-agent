---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Patch application and regression tests in SWE-bench grading]]"
---

# Regression checks protect behavior beyond the reported defect

Passing a test for the reported bug establishes one required behavior. Tests that already passed constrain the repair by checking that other behavior remains intact. A solution criterion needs both dimensions when unintended regressions matter, and its conclusion remains bounded by the tests actually executed.
