---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Negative passage selection in DPR]]"
---

# A passage positive for one question can be a false negative for another

In-batch training treats other questions' passages as alternatives presumed negative for the current question. That assumption can fail when questions overlap or several passages answer the same need. Efficient score reuse does not establish label exclusivity. Examining the construction of question-passage pairs is therefore necessary before interpreting every off-diagonal score as evidence of irrelevant content.
