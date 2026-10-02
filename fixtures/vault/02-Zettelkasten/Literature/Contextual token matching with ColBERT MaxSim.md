---
type: "literature"
created: "2026-10-02"
source_title: "ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT"
author: "Omar Khattab, Matei Zaharia"
year: "2020"
source: "ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT"
---

# Contextual token matching with ColBERT MaxSim

ColBERT encodes queries and documents independently into sets of contextual token embeddings. For every query embedding, its late interaction takes the highest similarity to a document embedding and sums these maxima over the query embeddings. The paper describes cosine similarity and also evaluates squared L2 distance. Independent encoding allows document representations to be computed offline while retaining token-level matching at query time.
