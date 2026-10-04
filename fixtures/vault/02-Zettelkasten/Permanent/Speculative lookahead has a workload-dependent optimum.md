---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Acceptance cost and lookahead in speculative speedup]]"
---

# Speculative lookahead has a workload-dependent optimum

A longer draft block gives more opportunities to accept tokens, but later proposals are useful only if the earlier prefix survives. Their expected contribution diminishes while draft cost continues accumulating. Lookahead should be selected using acceptance behavior and actual execution costs for the workload, including the effect of batching on those costs.
