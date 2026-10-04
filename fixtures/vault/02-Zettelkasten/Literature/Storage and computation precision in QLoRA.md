---
type: "literature"
created: "2026-10-02"
source_title: "QLoRA: Efficient Finetuning of Quantized LLMs"
author: "Tim Dettmers et al."
year: "2023"
source: "QLoRA: Efficient Finetuning of Quantized LLMs"
---

# Storage and computation precision in QLoRA

QLoRA stores the frozen base weights in a low-precision format and dequantizes them to a higher-precision computation type for matrix operations. Its usual combination is four-bit NormalFloat storage with BFloat16 computation. The trainable parameters are LoRA adapters. NormalFloat uses quantization levels motivated by a zero-centered normal weight distribution, including an exact zero representation; it is not described as universally optimal for arbitrary tensor distributions.
