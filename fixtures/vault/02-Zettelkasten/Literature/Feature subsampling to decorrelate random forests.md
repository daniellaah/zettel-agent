---
type: "literature"
created: "2026-10-02"
source_title: "An Introduction to Statistical Learning: with Applications in Python"
author: "Gareth James, Daniela Witten, Trevor Hastie, Robert Tibshirani, Jonathan Taylor"
year: "2023"
source: "An Introduction to Statistical Learning: with Applications in Python"
---

# Feature subsampling to decorrelate random forests

Random forests fit trees to bootstrap samples and restrict each split to a fresh random subset of predictors. The book explains that a dominant predictor can make bagged trees choose similar early splits, producing correlated predictions. Restricting the candidates allows other predictors to be used and reduces correlation between trees. Allowing all predictors at every split recovers the bagging setup described in the chapter.
