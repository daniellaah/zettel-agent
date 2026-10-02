---
type: "literature"
created: "2026-10-02"
source_title: "QLoRA: Efficient Finetuning of Quantized LLMs"
author: "Tim Dettmers et al."
year: "2023"
source: "QLoRA: Efficient Finetuning of Quantized LLMs"
---

# Double quantization of blockwise scaling constants

QLoRA's double quantization compresses the constants required by its first weight quantization. The paper explains that small quantization blocks improve precision while increasing scaling-constant overhead. It uses a second quantization for those constants, along with higher-level constants, to reduce their average storage cost. The reported memory calculation distinguishes this metadata saving from the four-bit codes used for the underlying model weights.
