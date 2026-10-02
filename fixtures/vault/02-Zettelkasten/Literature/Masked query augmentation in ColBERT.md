---
type: "literature"
created: "2026-10-02"
source_title: "ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT"
author: "Omar Khattab, Matei Zaharia"
year: "2020"
source: "ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT"
---

# Masked query augmentation in ColBERT

ColBERT pads short queries to a fixed length with BERT mask tokens after adding a query marker. BERT generates contextual embeddings at these masked positions, and the encoder applies a linear projection and L2 normalization. The authors intend this query augmentation to provide a differentiable way to expand or reweight matching signals. Queries longer than the configured length are truncated.
