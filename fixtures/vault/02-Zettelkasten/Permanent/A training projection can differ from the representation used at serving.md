---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Projection heads and downstream representations in SimCLR]]"
  - "[[Sequential training and indexed serving in neural retrieval]]"
---

# A training projection can differ from the representation used at serving

A training loss may act on a transformed representation while downstream tasks use an earlier encoder output. Index construction must select the representation intended for retrieval rather than assuming the loss input is the serving vector. That choice changes both the geometry of the index and the computation exported with the model.
