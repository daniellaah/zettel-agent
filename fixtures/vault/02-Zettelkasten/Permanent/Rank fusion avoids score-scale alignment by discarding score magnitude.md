---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Rank-based combination with reciprocal rank fusion]]"
---

# Rank fusion avoids score-scale alignment by discarding score magnitude

Ranks let systems contribute without putting their raw scores on a common scale. That convenience also discards how far apart adjacent scores are. Fusion preserves ordering evidence while changing what information is available to the combination rule. Its suitability therefore depends on whether relative ranks provide enough signal for the task, and should be assessed on the combined candidate set.
