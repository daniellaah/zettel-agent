---
type: "literature"
created: "2026-10-02"
source_title: "ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT"
author: "Omar Khattab, Matei Zaharia"
year: "2020"
source: "ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT"
---

# Token-index filtering and document refinement in ColBERT

ColBERT indexes document token embeddings and retains a mapping from each embedding to its source document. At query time it searches the vector index separately for each query embedding, maps the matches to document IDs, and deduplicates them. It then exhaustively computes its document score for that candidate set. The paper uses an approximate IVFPQ index for the initial filtering stage.
