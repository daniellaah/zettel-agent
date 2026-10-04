---
type: "literature"
created: "2026-10-02"
source_title: "LoRA: Low-Rank Adaptation of Large Language Models"
author: "Edward J. Hu et al."
year: "2021"
source: "LoRA: Low-Rank Adaptation of Large Language Models"
---

# LoRA merging and adapter storage

LoRA's learned update can be absorbed into the pretrained matrix for deployment, eliminating the additional computation from a separate adapter path. The paper also describes keeping modules separate when selecting among adaptations dynamically is desirable. Multiple adaptations can share the same pretrained model while storing their own small update factors. This reduces adaptation storage, but the underlying model is still required for deployment.
