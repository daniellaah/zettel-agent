---
type: "literature"
created: "2026-10-02"
source_title: "DeepSeekMath: Pushing the Limits of Mathematical Reasoning in Open Language Models"
author: "Zhihong Shao et al."
year: "2024"
source: "DeepSeekMath: Pushing the Limits of Mathematical Reasoning in Open Language Models"
---

# Group-relative advantages in GRPO

GRPO samples several outputs for the same question and estimates a baseline from their rewards rather than training a value model. For outcome supervision, it subtracts the group's mean reward and divides by the group standard deviation, applying the resulting advantage to tokens in each output. Its objective includes clipped policy-ratio terms and reference-policy regularization. The paper also explores process rewards, which assign feedback to intermediate reasoning steps.
