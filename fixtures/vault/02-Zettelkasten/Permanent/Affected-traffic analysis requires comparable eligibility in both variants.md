---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Counterfactual logging for affected traffic]]"
---

# Affected-traffic analysis requires comparable eligibility in both variants

Selecting only treated users who saw a new feature produces no directly equivalent control group when the feature does not exist there. Counterfactual eligibility logging supplies a common selection rule for both variants. Its correctness becomes part of the experiment design. More sensitive analysis is useful only if the affected populations remain comparable and the trigger does not introduce differential selection.
