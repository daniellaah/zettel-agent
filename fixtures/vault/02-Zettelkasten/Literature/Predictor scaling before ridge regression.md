---
type: "literature"
created: "2026-10-02"
source_title: "An Introduction to Statistical Learning: with Applications in Python"
author: "Gareth James, Daniela Witten, Trevor Hastie, Robert Tibshirani, Jonathan Taylor"
year: "2023"
source: "An Introduction to Statistical Learning: with Applications in Python"
---

# Predictor scaling before ridge regression

Multiplying a predictor by a constant changes its least-squares coefficient inversely while preserving the fitted contribution. Ridge regression does not have this property because its penalty depends on coefficient magnitudes. The book recommends scaling predictors to have unit standard deviation before ridge fitting so that measurement units do not determine the relative shrinkage. The transformation places the predictors on a common scale.
