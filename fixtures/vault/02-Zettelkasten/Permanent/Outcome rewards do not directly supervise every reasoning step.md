---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Group-relative advantages in GRPO]]"
  - "[[Rule-based accuracy and format rewards in R1-Zero]]"
---

# Outcome rewards do not directly supervise every reasoning step

A final-answer reward can improve the probability of successful trajectories without labeling each intermediate statement as valid. Incorrect reasoning can occasionally reach a correct answer, and valid reasoning can end with an execution mistake. Process supervision addresses a different granularity of evidence. Success under outcome checks should therefore not be reported as a guarantee that every generated reasoning step is correct.
