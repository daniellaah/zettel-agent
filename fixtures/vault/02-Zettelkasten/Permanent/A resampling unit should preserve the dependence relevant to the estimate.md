---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Bootstrap resampling for estimator variability]]"
  - "[[Randomization units and interference]]"
---

# A resampling unit should preserve the dependence relevant to the estimate

Resampling individual rows treats those rows as the interchangeable units of evidence. When several rows come from the same user or group, splitting them can discard relevant dependence and distort uncertainty. The sampling unit should follow the structure of the estimation problem, with an appropriate grouped procedure justified separately.
