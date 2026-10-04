---
type: "literature"
created: "2026-10-02"
source_title: "Hidden Technical Debt in Machine Learning Systems"
author: "D. Sculley et al."
year: "2015"
source: "Hidden Technical Debt in Machine Learning Systems"
---

# Entanglement among ML model changes

Changing an input distribution can change the weights, importance, or use of other features in a learned model. The paper extends this entanglement to hyperparameters, sampling, convergence thresholds, and data selection. It describes isolating models and using ensembles as one possible mitigation, while noting that correlated component errors can still make an individual improvement reduce ensemble accuracy. Slice-based prediction monitoring is another proposed approach.
