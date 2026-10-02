---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Token-index filtering and document refinement in ColBERT]]"
  - "[[Contextual token matching with ColBERT MaxSim]]"
---

# Candidate filtering can exclude a document with a competitive aggregate score

A document with several moderately strong query-token matches can score well after aggregation without containing a token among any small initial nearest-neighbor list. The refinement stage only sees nominated documents. Choosing token-level candidate depth therefore affects coverage under the aggregate document score, independently of the exactness of final scoring.
