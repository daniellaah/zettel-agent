---
type: "literature"
created: "2026-10-02"
source_title: "QLoRA: Efficient Finetuning of Quantized LLMs"
author: "Tim Dettmers et al."
year: "2023"
source: "QLoRA: Efficient Finetuning of Quantized LLMs"
---

# Paged optimizer states for training memory spikes

QLoRA uses unified memory for optimizer states to address transient GPU memory spikes, including those associated with long sequences and gradient checkpointing. The system can move state to CPU memory under pressure and return it when the optimizer update needs it. The paper presents this mechanism alongside low-bit weight storage and double quantization as a separate contribution to the fine-tuning memory design.
