---
type: "literature"
created: "2026-10-02"
source_title: "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness"
author: "Tri Dao, Daniel Y. Fu, Stefano Ermon, Atri Rudra, Christopher Ré"
year: "2022"
source: "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness"
---

# Backward recomputation in FlashAttention

FlashAttention stores the attention output and row-level softmax statistics instead of retaining the full intermediate score and probability matrices for backward computation. It reconstructs the needed blocks from queries, keys, and values in on-chip memory. The paper describes this as selective gradient checkpointing. In its measured implementation, the additional arithmetic reduces memory accesses enough to make backward computation faster.
