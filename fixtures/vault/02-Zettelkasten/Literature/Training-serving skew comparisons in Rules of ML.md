---
type: "literature"
created: "2026-10-02"
source_title: "Rules of Machine Learning: Best Practices for ML Engineering"
author: "Martin Zinkevich"
year: ""
source: "Rules of Machine Learning: Best Practices for ML Engineering"
---

# Training-serving skew comparisons in Rules of ML

The guide distinguishes performance differences between training and holdout data, holdout and next-day data, and next-day and live data. The first comparison concerns generalization, while the second may reveal time-sensitive features. Applying the same model to the same example in training and serving should give the same result. A discrepancy in that identical-example comparison is described as a likely engineering error.
