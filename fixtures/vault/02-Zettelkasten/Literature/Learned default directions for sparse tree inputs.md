---
type: "literature"
created: "2026-10-02"
source_title: "XGBoost: A Scalable Tree Boosting System"
author: "Tianqi Chen, Carlos Guestrin"
year: "2016"
source: "XGBoost: A Scalable Tree Boosting System"
---

# Learned default directions for sparse tree inputs

XGBoost assigns each split a learned default direction for examples without the relevant sparse feature value. Split finding visits the non-missing entries and evaluates possible default directions using the training statistics. The paper treats non-presence as missing in its presented algorithm and also discusses a user-specified absent value. This allows the split procedure to exploit sparse input rather than scanning a dense representation.
