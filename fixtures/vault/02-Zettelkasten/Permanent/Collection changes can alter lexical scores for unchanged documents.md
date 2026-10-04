---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Document frequency and tf-idf weighting]]"
  - "[[Term saturation and length scaling in BM25]]"
---

# Collection changes can alter lexical scores for unchanged documents

Document frequency and average document length depend on the collection. Adding documents can change those statistics while leaving a particular query and document untouched. Its lexical score may therefore change without any edit to its text. A reproducible retrieval comparison needs a defined corpus snapshot as well as a scoring formula and query set.
