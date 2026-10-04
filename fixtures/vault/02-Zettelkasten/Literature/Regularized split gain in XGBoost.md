---
type: "literature"
created: "2026-10-02"
source_title: "XGBoost: A Scalable Tree Boosting System"
author: "Tianqi Chen, Carlos Guestrin"
year: "2016"
source: "XGBoost: A Scalable Tree Boosting System"
---

# Regularized split gain in XGBoost

The split score compares the regularized objective contributions of two proposed child leaves with their unsplit parent. XGBoost computes those contributions from gradient and Hessian sums and subtracts the additional leaf penalty. Its exact greedy algorithm examines feature values in sorted order, accumulates the left-child statistics, and derives right-child statistics from the parent totals. It selects a split using the resulting objective reduction.
