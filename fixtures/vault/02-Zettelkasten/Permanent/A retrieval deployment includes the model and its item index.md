---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Sequential training and indexed serving in neural retrieval]]"
---

# A retrieval deployment includes the model and its item index

Changing an item tower changes the coordinate system of the embeddings it produces. An online query tower should be paired with an item index prepared for a compatible model state. Deploying weights while silently retaining incompatible stored vectors can invalidate score comparisons.

Treat index generation, query-model export and rollout as parts of one retrieval deployment. This follows from [[A reusable item index requires a factorized scoring function]]: precomputation moves some inference work earlier, but does not remove its dependence on the learned model.
