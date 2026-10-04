---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Contextual token matching with ColBERT MaxSim]]"
---

# MaxSim scoring is asymmetric between query and document

Summing one maximum for each query embedding treats query coverage as the aggregation direction. Exchanging the query and document changes the set over which terms are summed, so the document score need not be symmetric even if the underlying vector similarity is. A similarity metric for individual vectors does not determine symmetry of the full retrieval function.
