---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Average precision and graded ranking evaluation]]"
---

# Ranking metrics encode different notions of usefulness

MAP emphasizes precision at relevant-document positions under binary judgments, while NDCG can reward degrees of relevance and discount lower positions. A change can improve one without improving the other because they summarize different utilities. Selecting a metric therefore requires connecting its ranking preference to the intended task, rather than treating metric names as interchangeable indicators of quality.
