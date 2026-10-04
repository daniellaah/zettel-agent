---
type: "literature"
created: "2026-10-02"
source_title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks"
author: "Patrick Lewis et al."
year: "2020"
source: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks"
---

# Latent documents and joint training in RAG

RAG-Sequence marginalizes one retrieved latent document across an entire output sequence, while RAG-Token marginalizes documents separately at each output position. Both use a top-K approximation. The reported training optimizes target sequence likelihood without explicit labels for which document to retrieve. It updates the query encoder and generator while keeping the document encoder and index fixed, avoiding repeated index reconstruction during fine-tuning.
