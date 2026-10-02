---
type: "literature"
created: "2026-10-02"
source_title: "LoRA: Low-Rank Adaptation of Large Language Models"
author: "Edward J. Hu et al."
year: "2021"
source: "LoRA: Low-Rank Adaptation of Large Language Models"
---

# Frozen weights and low-rank updates in LoRA

LoRA freezes a pretrained weight matrix and represents its trainable update as a product of two smaller matrices. The forward computation sums the frozen matrix output and the low-rank update output for the same input. One factor is initialized randomly and the other to zero, so the initial update is zero. A scaling factor controls the contribution of the update while the rank sets the dimension of the adaptation factors.
