---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Dual encoders and passage preparation in DPR]]"
---

# Passage preparation defines what the retriever can return

Splitting documents into passages determines the granularity of indexed evidence, and removing non-prose content determines which answers remain available at all. These are substantive retrieval decisions rather than neutral file conversion. A downstream model cannot recover a table discarded before indexing through better passage ranking. This is another form of [[Candidate coverage limits what a ranker can recover]].
