---
type: "literature"
created: "2026-10-02"
source_title: "XGBoost: A Scalable Tree Boosting System"
author: "Tianqi Chen, Carlos Guestrin"
year: "2016"
source: "XGBoost: A Scalable Tree Boosting System"
---

# Second-order leaf optimization in XGBoost

XGBoost adds trees to an ensemble while minimizing prediction loss and a tree-complexity penalty. Its second-order approximation uses each example's gradient and Hessian evaluated at the current prediction. For a fixed tree structure, the optimal leaf weight is the negative sum of gradients divided by the sum of Hessians plus the weight regularization parameter. The structure score also includes a penalty for the number of leaves.
