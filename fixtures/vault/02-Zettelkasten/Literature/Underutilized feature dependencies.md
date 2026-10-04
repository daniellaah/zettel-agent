---
type: "literature"
created: "2026-10-02"
source_title: "Hidden Technical Debt in Machine Learning Systems"
author: "D. Sculley et al."
year: "2015"
source: "Hidden Technical Debt in Machine Learning Systems"
---

# Underutilized feature dependencies

The paper describes input signals that provide little incremental predictive benefit while retaining dependencies on other systems. Such signals can arise from legacy features, bundled additions, small accuracy gains, or correlated alternatives. They can leave a model vulnerable to upstream changes even when they could be removed without loss. The authors recommend regularly running exhaustive leave-one-feature-out evaluations to identify and remove unnecessary features.
