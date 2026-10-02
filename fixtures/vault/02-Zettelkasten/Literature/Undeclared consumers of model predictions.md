---
type: "literature"
created: "2026-10-02"
source_title: "Hidden Technical Debt in Machine Learning Systems"
author: "D. Sculley et al."
year: "2015"
source: "Hidden Technical Debt in Machine Learning Systems"
---

# Undeclared consumers of model predictions

Model predictions made available through services, files, or logs may be used by other systems without declared dependencies. The paper describes these consumers as a hidden coupling that makes the effects of model updates difficult to understand. Even an improvement to the producer can harm its consumers. Access restrictions and strict service-level agreements are suggested ways to make or constrain these dependencies explicitly.
