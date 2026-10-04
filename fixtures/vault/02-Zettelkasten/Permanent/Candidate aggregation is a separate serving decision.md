---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Relevance and diversity aggregation in ComiRec]]"
  - "[[Multi-interest representations in MIND]]"
---

# Candidate aggregation is a separate serving decision

Multiple searches produce a candidate pool, while aggregation determines which candidates become the final list. Keeping these decisions separate makes it possible to vary list-level objectives without retraining the interest extractor. The pool still constrains the result. This extends [[Candidate coverage limits what a ranker can recover]] to multi-interest retrieval: selection policies depend on what all the searches jointly return.
