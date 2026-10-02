---
type: "literature"
created: "2026-10-02"
source_title: "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness"
author: "Tri Dao, Daniel Y. Fu, Stefano Ermon, Atri Rudra, Christopher Ré"
year: "2022"
source: "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness"
---

# Blockwise softmax accumulation in FlashAttention

FlashAttention loads blocks of queries, keys, and values into fast on-chip memory and combines their attention contributions without storing the full score or probability matrices in high-bandwidth memory. It maintains row maxima and normalization sums, rescales earlier contributions when the maxima change, and updates the output. The paper proves that this procedure returns the same attention expression as the full matrix computation.
