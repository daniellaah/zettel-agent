---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Shared prefixes and copy-on-write in vLLM]]"
  - "[[PagedAttention and logical KV-cache blocks]]"
---

# KV-cache sharing follows shared prefixes until continuations diverge

Sequences with a common prompt can reuse the same cached prefix states, but divergent continuations require private writable state. Copy-on-write preserves this boundary while avoiding unnecessary duplication of unchanged blocks. The memory benefit therefore depends on shared-prefix length and branching behavior. Paging improves allocation and sharing; it does not eliminate the cache growth caused by genuinely different generated tokens.
