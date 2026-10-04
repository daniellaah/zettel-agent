---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Paged optimizer states for training memory spikes]]"
  - "[[PagedAttention and logical KV-cache blocks]]"
---

# Paged optimizer states and paged KV caches solve different lifecycles

QLoRA paging manages training optimizer state under transient GPU pressure, while PagedAttention organizes the growing attention cache during serving. Both use memory-management ideas, but the stored tensors and workloads differ. The common word paged should not suggest interchangeable implementations or benefits. Explaining the tensor lifecycle makes clear which memory problem each technique addresses.
