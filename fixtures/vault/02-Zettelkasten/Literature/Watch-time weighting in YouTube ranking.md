---
type: "literature"
created: "2026-10-02"
source_title: "Deep Neural Networks for YouTube Recommendations"
author: "Paul Covington, Jay Adams, Emre Sargin"
year: "2016"
source: "Deep Neural Networks for YouTube Recommendations"
---

# Watch-time weighting in YouTube ranking

YouTube's ranking model trains a logistic predictor on impressions. Clicked impressions receive weights equal to their observed watch time, while unclicked impressions receive unit weight. This changes the quantity represented by the fitted model from an ordinary click probability.

The authors relate the learned odds to expected watch time. Under their assumption that positive impressions form a small fraction of the data, those odds approximate the expected watch time of an impression. At inference, exponentiating the model's output produces the odds used for scoring. The approximation explicitly depends on the low-click-probability setting.
