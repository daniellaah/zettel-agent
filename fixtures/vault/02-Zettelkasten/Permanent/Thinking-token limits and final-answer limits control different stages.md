---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Thinking-mode fusion and budget control in Qwen3]]"
---

# Thinking-token limits and final-answer limits control different stages

Stopping the reasoning segment at a budget and allowing a final response differs from cutting off the entire generation at the same token count. The former preserves an opportunity to summarize the available work. Evaluation should record both limits and the stopping mechanism. More thinking tokens represent additional inference expenditure whose benefit depends on the task and model, rather than an unconditional quality guarantee.
