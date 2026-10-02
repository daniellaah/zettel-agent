---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Contextual token matching with ColBERT MaxSim]]"
  - "[[Answer correctness and citation coverage in ALCE]]"
---

# Strong token matches do not establish a coherent supporting claim

Different query embeddings can match different parts of a document with high similarity. Those local matches need not jointly express the proposition an answer would cite. Retrieval scores help choose evidence to inspect, while checking whether the passage supports a generated claim remains a separate operation.
