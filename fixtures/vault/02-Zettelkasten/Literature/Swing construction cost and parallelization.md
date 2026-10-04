---
type: "literature"
created: "2026-10-02"
source_title: "Large Scale Product Graph Construction for Recommendation in E-commerce"
author: "Xiaoyong Yang et al."
year: "2020"
source: "Large Scale Product Graph Construction for Recommendation in E-commerce"
---

# Swing construction cost and parallelization

The paper compares Swing's construction cost with conventional local item-similarity computation. Its complexity analysis introduces an additional factor for item-neighborhood user degree because Swing considers user pairs. The implementation parallelizes construction using a MapReduce framework: input consists of per-user clicked-item lists, mapper outputs distribute local neighborhoods, and reducers gather users associated with seed items. The similarity computation described in this part of the paper uses clicks rather than explicit ratings.
