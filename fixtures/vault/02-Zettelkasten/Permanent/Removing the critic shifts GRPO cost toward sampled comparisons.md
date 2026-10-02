---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Group-relative advantages in GRPO]]"
---

# Removing the critic shifts GRPO cost toward sampled comparisons

GRPO avoids maintaining a learned value model by estimating relative advantages from a group of sampled answers. It still needs to generate and score those answers. The resulting efficiency depends on model sizes, group size, response length, and reward computation. Removing one network reduces a specific resource requirement rather than making reinforcement learning inexpensive regardless of rollout workload.
