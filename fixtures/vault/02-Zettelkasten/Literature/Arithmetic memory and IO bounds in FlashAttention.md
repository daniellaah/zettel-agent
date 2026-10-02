---
type: "literature"
created: "2026-10-02"
source_title: "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness"
author: "Tri Dao, Daniel Y. Fu, Stefano Ermon, Atri Rudra, Christopher Ré"
year: "2022"
source: "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness"
---

# Arithmetic memory and IO bounds in FlashAttention

For sequence length N and head dimension d, the paper states that FlashAttention uses O(N squared times d) arithmetic and O(N) additional memory beyond its inputs and output. For on-chip memory size M between d and N times d, its analyzed high-bandwidth-memory accesses are proportional to N squared times d squared divided by M. These bounds describe arithmetic, auxiliary storage, and memory traffic separately.
