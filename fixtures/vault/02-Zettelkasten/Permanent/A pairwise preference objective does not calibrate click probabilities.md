---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Pairwise logistic likelihood and priors in BPR]]"
  - "[[Logistic probabilities and linear log odds]]"
---

# A pairwise preference objective does not calibrate click probabilities

A probability that one item outranks another is a different event from the user clicking an individual item. Pairwise training can order candidates without estimating their marginal click probabilities. Converting its item scores through a sigmoid does not establish click calibration; that interpretation would need a model and validation for the click event itself.
