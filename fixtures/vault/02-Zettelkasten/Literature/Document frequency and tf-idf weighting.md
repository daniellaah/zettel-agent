---
type: "literature"
created: "2026-10-02"
source_title: "Introduction to Information Retrieval"
author: "Christopher D. Manning, Prabhakar Raghavan, Hinrich Schütze"
year: "2008"
source: "Introduction to Information Retrieval"
---

# Document frequency and tf-idf weighting

Inverse document frequency uses the number of documents containing a term rather than its total occurrences across the collection. The book defines this weight as the logarithm of collection size divided by document frequency. Combining it with within-document term frequency gives tf-idf. A term appearing in few documents receives more discriminating weight than one appearing throughout the collection, even when their collection-wide occurrence counts are similar.
