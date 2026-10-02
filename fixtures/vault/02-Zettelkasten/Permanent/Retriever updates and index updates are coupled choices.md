---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Latent documents and joint training in RAG]]"
  - "[[Dual encoders and passage preparation in DPR]]"
---

# Retriever updates and index updates are coupled choices

Updating a query encoder can change retrieval against fixed passage vectors. Updating the passage encoder changes the representation of the stored collection and generally requires rebuilding or refreshing those vectors. Joint training claims should specify which encoder moves. This connects to [[A retrieval deployment includes the model and its item index]], because serving depends on compatible representations on both sides.
