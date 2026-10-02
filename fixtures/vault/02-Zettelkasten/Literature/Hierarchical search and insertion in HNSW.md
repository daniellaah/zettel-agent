---
type: "literature"
created: "2026-10-02"
source_title: "Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs"
author: "Yu. A. Malkov, D. A. Yashunin"
year: "2016"
source: "Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs"
---

# Hierarchical search and insertion in HNSW

HNSW stores vectors in a hierarchy of proximity graphs. Each inserted vector receives a randomly selected maximum level with an exponentially decreasing level distribution. Insertion searches from upper layers downward and connects the new vector to selected neighbors on its eligible layers.

Query search first performs greedy traversal on upper layers, using a small candidate set to find an entry point near the query. The bottom layer performs a broader search with a dynamic set of promising candidates. The final nearest candidates are returned from this ground-layer search. Upper and lower layers therefore use different search breadths.
