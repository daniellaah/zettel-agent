---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Acceptance cost and lookahead in speculative speedup]]"
---

# Fewer serial target calls can require more total arithmetic

Parallel verification evaluates candidate continuations that may later be discarded. Reducing serial target calls can therefore increase total work while lowering latency when otherwise unused compute is available. The benefit depends on available concurrency and memory behavior, rather than following from token-call counts alone.
