---
type: "literature"
created: "2026-10-02"
source_title: "Multi-Interest Network with Dynamic Routing for Recommendation at Tmall"
author: "Chao Li et al."
year: "2019"
source: "Multi-Interest Network with Dynamic Routing for Recommendation at Tmall"
---

# Multi-interest representations in MIND

MIND represents a user with several interest vectors instead of compressing every observed behavior into one vector. Item features are embedded and pooled before a behavior-to-interest layer aggregates the behavior embeddings into separate interests. The matching score for an item is the maximum inner product between that item's embedding and the user's interest vectors. The model uses this representation for the matching stage, where a large item collection must be reduced to candidates before ranking.
