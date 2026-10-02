---
type: "literature"
created: "2026-10-02"
source_title: "Controllable Multi-Interest Framework for Recommendation"
author: "Yukuo Cen et al."
year: "2020"
source: "Controllable Multi-Interest Framework for Recommendation"
---

# Relevance and diversity aggregation in ComiRec

ComiRec retrieves candidates separately for each interest and then selects a final list using a controllable aggregation objective. Item relevance is the maximum inner product over the user's interests. The objective adds a weighted sum of pairwise item dissimilarities; the paper uses different item categories as its dissimilarity signal. A parameter controls the relative weight of this diversity term. A greedy inference algorithm approximately maximizes the objective rather than solving the selection problem exactly.
