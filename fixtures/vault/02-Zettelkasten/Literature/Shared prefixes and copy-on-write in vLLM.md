---
type: "literature"
created: "2026-10-02"
source_title: "Efficient Memory Management for Large Language Model Serving with PagedAttention"
author: "Woosuk Kwon et al."
year: "2023"
source: "Efficient Memory Management for Large Language Model Serving with PagedAttention"
---

# Shared prefixes and copy-on-write in vLLM

Sequences generated from the same prompt can map their logical prompt blocks to the same physical KV-cache blocks. vLLM tracks references to shared blocks. When a sequence needs to modify a shared block, it allocates and copies a private block before writing. This block-level copy-on-write approach lets parallel sampling and beam search reuse common prefix state while storing divergent continuations separately.
