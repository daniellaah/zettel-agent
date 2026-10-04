---
type: "literature"
created: "2026-10-02"
source_title: "Dense Passage Retrieval for Open-Domain Question Answering"
author: "Vladimir Karpukhin et al."
year: "2020"
source: "Dense Passage Retrieval for Open-Domain Question Answering"
---

# Dual encoders and passage preparation in DPR

DPR uses independent BERT question and passage encoders and scores pairs by embedding inner product. Passage vectors are computed and indexed offline; online questions are encoded and used to retrieve nearby passages. Its Wikipedia preparation removes several kinds of non-prose material and splits articles into disjoint 100-word passages. Each passage includes its article title, and these passages form the units used for retrieval.
