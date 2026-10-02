---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Contextual token matching with ColBERT MaxSim]]"
---

# Independent document encoding limits where query-specific interaction can occur

A document representation computed before the query cannot condition its encoder attention on that query. Late interaction retains detailed matching while accepting this constraint on the encoder. Comparing it with a cross-encoder therefore involves both serving reuse and the location of query-document interaction, rather than simply the number of vectors stored.
