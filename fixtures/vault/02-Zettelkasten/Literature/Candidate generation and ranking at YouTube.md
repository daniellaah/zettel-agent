---
type: "literature"
created: "2026-10-02"
source_title: "Deep Neural Networks for YouTube Recommendations"
author: "Paul Covington, Jay Adams, Emre Sargin"
year: "2016"
source: "Deep Neural Networks for YouTube Recommendations"
---

# Candidate generation and ranking at YouTube

YouTube separates recommendation into candidate generation and ranking. Candidate generation uses user history and context to select hundreds of videos from a much larger collection. Ranking evaluates this smaller set with richer features and a presentation-specific objective before choosing the displayed results. The architecture also permits candidates from other retrieval sources. The ranking features include which sources nominated a video and the scores those sources assigned.

The authors use offline measures to guide development but rely on live A/B experiments to determine effectiveness. They report that offline and online results do not always move together. The two stages therefore serve distinct computational and prediction roles within the same recommendation process.
