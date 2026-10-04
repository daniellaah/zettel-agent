---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Inverted-file pruning in Faiss similarity search]]"
  - "[[Product quantization and asymmetric distance computation]]"
---

# Increasing IVF search breadth addresses pruning rather than quantization

Searching more inverted lists exposes a query to more candidate vectors and can recover items excluded by coarse partition pruning. It does not, by itself, replace the compressed representations used to estimate distances within those lists.

IVFADC thus has two distinct approximation mechanisms: deciding where to search and estimating the scores of visited vectors. Diagnose them separately before choosing between broader probing, better codes or an exact reranking step. [[ANN approximation adds a separate source of retrieval loss]] supplies the broader evaluation boundary.
