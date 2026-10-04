---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Inverted-file pruning in Faiss similarity search]]"
  - "[[Hierarchical search and insertion in HNSW]]"
---

# ANN approximation adds a separate source of retrieval loss

A retrieval model defines scores over a corpus, while an approximate index searches for high-scoring items without necessarily reproducing exhaustive search. Failure to return an item can therefore arise from either the learned scoring function or the approximation used to search it.

Compare approximate results with exact results under the same fixed embeddings to isolate index loss. Relevance judgments against user outcomes evaluate a different boundary. Both affect [[Candidate coverage limits what a ranker can recover]], but require different remedies.
