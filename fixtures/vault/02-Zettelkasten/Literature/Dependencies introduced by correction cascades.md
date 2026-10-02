---
type: "literature"
created: "2026-10-02"
source_title: "Hidden Technical Debt in Machine Learning Systems"
author: "D. Sculley et al."
year: "2015"
source: "Hidden Technical Debt in Machine Learning Systems"
---

# Dependencies introduced by correction cascades

A correction model can take an existing model output as input to solve a related problem. The paper explains that this creates a dependency on the original model, and additional correction layers increase the cost of analyzing changes. An individual component improvement can harm the combined system. The authors propose learning the corrections within the original model using distinguishing features, or accepting the cost of a separate model for the related problem.
