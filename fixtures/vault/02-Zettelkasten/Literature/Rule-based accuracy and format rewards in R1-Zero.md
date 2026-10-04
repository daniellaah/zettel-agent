---
type: "literature"
created: "2026-10-02"
source_title: "DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning"
author: "DeepSeek-AI"
year: "2025"
source: "DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning"
---

# Rule-based accuracy and format rewards in R1-Zero

DeepSeek-R1-Zero uses rule-based rewards for verifiable mathematical, coding, and logical reasoning tasks. Accuracy rewards assess answers or execution against task checks; format rewards encourage separating reasoning from the final answer with designated tags. The paper describes applying RL to the pretrained base and observing longer responses and reflective behavior during training. It avoids neural reasoning reward models in this setup because of observed reward-hacking and training-complexity concerns.
