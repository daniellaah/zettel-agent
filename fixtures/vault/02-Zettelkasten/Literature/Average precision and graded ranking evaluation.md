---
type: "literature"
created: "2026-10-02"
source_title: "Introduction to Information Retrieval"
author: "Christopher D. Manning, Prabhakar Raghavan, Hinrich Schütze"
year: "2008"
source: "Introduction to Information Retrieval"
---

# Average precision and graded ranking evaluation

Average precision averages the precision reached at relevant-document ranks, assigning zero contribution to relevant documents not retrieved. MAP averages those values across information needs, giving each need equal aggregate weight. NDCG instead supports graded relevance, discounts contributions at lower ranks, and normalizes against a perfect ordering at the chosen cutoff. The book presents these as different ways to evaluate ranked retrieval results.
