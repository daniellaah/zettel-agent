---
type: "literature"
created: "2026-10-02"
source_title: "Efficient Memory Management for Large Language Model Serving with PagedAttention"
author: "Woosuk Kwon et al."
year: "2023"
source: "Efficient Memory Management for Large Language Model Serving with PagedAttention"
---

# PagedAttention and logical KV-cache blocks

PagedAttention divides a request's key-value cache into fixed-size token blocks that can occupy non-contiguous physical memory. A mapping connects logical sequence blocks to physical cache blocks. Allocating blocks as needed avoids reserving a contiguous maximum-length region for every request. Equal-size blocks remove external fragmentation, while unused slots can remain in a partially filled final block. The paper implements this design within the vLLM serving engine.
