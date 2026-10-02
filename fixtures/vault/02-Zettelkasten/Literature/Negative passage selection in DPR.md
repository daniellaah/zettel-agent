---
type: "literature"
created: "2026-10-02"
source_title: "Dense Passage Retrieval for Open-Domain Question Answering"
author: "Vladimir Karpukhin et al."
year: "2020"
source: "Dense Passage Retrieval for Open-Domain Question Answering"
---

# Negative passage selection in DPR

DPR optimizes the negative log probability of a positive passage against selected negative passages. The paper considers random corpus passages, high-ranked BM25 passages without the answer, and positives belonging to other questions. In-batch negatives reuse passage embeddings across the batch, creating a matrix of question-passage scores. The reported best training setup combines these in-batch gold passages with a BM25 negative.
