---
type: "literature"
created: "2026-10-02"
source_title: "Introduction to Information Retrieval"
author: "Christopher D. Manning, Prabhakar Raghavan, Hinrich Schütze"
year: "2008"
source: "Introduction to Information Retrieval"
---

# Term saturation and length scaling in BM25

The book introduces BM25 as a probabilistic scoring scheme sensitive to term frequency and document length. Its term-frequency component increases with occurrences while saturating, controlled by a tuning parameter. Another parameter controls scaling by document length relative to average collection length. Setting the length parameter to zero removes that normalization; setting it to one gives full length scaling in the presented formulation.
