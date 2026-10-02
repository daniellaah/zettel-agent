---
type: "literature"
created: "2026-10-02"
source_title: "Deep Neural Networks for YouTube Recommendations"
author: "Paul Covington, Jay Adams, Emre Sargin"
year: "2016"
source: "Deep Neural Networks for YouTube Recommendations"
---

# Temporal labels and user weighting in YouTube retrieval

The authors train candidate generation on watches from across YouTube rather than only watches produced by the recommender. They also generate a fixed number of examples per user so that highly active users do not dominate the objective.

For the prediction task, a randomly selected watch supplies the label, and only earlier actions supply its context. The authors report better results from predicting a future watch than from predicting a randomly held-out watch using the remaining history. The latter setup can expose later actions and discard the asymmetric order of consumption.
