---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Candidate generation and ranking at YouTube]]"
  - "[[Sequential training and indexed serving in neural retrieval]]"
---

# Candidate-source features preserve useful evidence for ranking

Candidates assembled from several retrieval mechanisms arrive with different evidence about relevance. Retaining the nominating source and its score gives the ranker information about how each candidate was found. Dropping that information makes independently generated candidates look more alike than their retrieval histories justify.

The source score need not be treated as a calibrated probability. It can be an input feature whose meaning is learned for the ranking task, within the stage separation described in [[Candidate coverage limits what a ranker can recover]].
