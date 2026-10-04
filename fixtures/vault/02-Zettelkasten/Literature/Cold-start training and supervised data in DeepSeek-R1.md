---
type: "literature"
created: "2026-10-02"
source_title: "DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning"
author: "DeepSeek-AI"
year: "2025"
source: "DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning"
---

# Cold-start training and supervised data in DeepSeek-R1

DeepSeek-R1 adds cold-start examples to address readability and language-mixing problems observed in R1-Zero. Its pipeline alternates supervised training and reinforcement learning, including rejection-sampled reasoning data and non-reasoning examples before a final alignment stage. The described supervised collection contains approximately 600,000 reasoning and 200,000 non-reasoning samples. Distilled Qwen and Llama models are fine-tuned on this 800,000-example collection rather than being presented as the same training process as R1-Zero.
