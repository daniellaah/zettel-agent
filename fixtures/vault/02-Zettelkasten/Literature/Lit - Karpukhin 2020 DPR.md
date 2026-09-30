---
type: literature
created: 2026-06-19
tags: [ir, paper, dense-retrieval]
aliases: [Dense Passage Retrieval, DPR]
---
# Lit - Karpukhin 2020 DPR

**Source**: Vladimir Karpukhin et al., "Dense Passage Retrieval for Open-Domain Question Answering", EMNLP 2020

## Idea
Replace the sparse first stage of open-domain QA with a dual encoder: one BERT encodes questions, another encodes passages, and relevance is their dot product. Passage vectors are indexed once; at query time retrieval is a maximum inner product search.

## Training
- Positives come from QA datasets; the interesting part is the negatives.
- In-batch negatives make training efficient: every other question's positive passage in the batch serves as a negative.
- Adding one "hard" negative per question, taken from the top BM25 results that do not contain the answer, helps noticeably.

## Results worth remembering
- On most of the benchmarks, the dense retriever finds a passage containing the answer in its top 20 more often than BM25.
- On the dataset where questions were written while looking at the passage, and so share many words with it, BM25 stays competitive or better.
- A linear combination of BM25 and dense scores helps on some datasets.

## Why it matters to me
It is the text-retrieval twin of the recsys two-tower setup, down to the in-batch negatives, and the lexical-overlap finding is exactly the case where I expect BM25 to keep winning on my notes.

## Related
- [[BM25 在专有名词查询上胜过稠密检索]]: the lexical-overlap result supports this note.
- [[双塔模型把召回变成最近邻搜索]]: same architecture in a different domain.
- [[In-batch negatives oversample popular items]]: DPR uses in-batch negatives too, but on passages, where popularity skew is milder.
