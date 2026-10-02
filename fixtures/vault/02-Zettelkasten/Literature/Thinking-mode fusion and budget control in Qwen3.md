---
type: "literature"
created: "2026-10-02"
source_title: "Qwen3 Technical Report"
author: "Qwen Team"
year: "2025"
source: "Qwen3 Technical Report"
---

# Thinking-mode fusion and budget control in Qwen3

The Qwen3 report describes a four-stage post-training pipeline that develops reasoning through cold-start training and RL, then combines thinking and non-thinking behavior and applies general RL. Thinking-mode fusion permits responses with and without explicit reasoning. For a thinking-token budget, the implementation stops the reasoning segment at a threshold and inserts an instruction to produce the final response from the reasoning accumulated so far. The report distinguishes this control from running every query through unrestricted thinking.
