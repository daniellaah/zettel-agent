---
type: "literature"
created: "2026-10-02"
source_title: "An Introduction to Statistical Learning: with Applications in Python"
author: "Gareth James, Daniela Witten, Trevor Hastie, Robert Tibshirani, Jonathan Taylor"
year: "2023"
source: "An Introduction to Statistical Learning: with Applications in Python"
---

# Ridge penalties and coefficient shrinkage

Ridge regression minimizes residual sum of squares plus a tuning parameter times the sum of squared slope coefficients. The intercept is excluded from the penalty. At zero penalty it recovers least squares; increasing the parameter decreases the overall coefficient norm. The book explains the resulting bias-variance tradeoff and notes that individual coefficients need not decrease monotonically along the regularization path.
