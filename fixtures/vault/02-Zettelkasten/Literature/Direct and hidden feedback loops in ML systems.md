---
type: "literature"
created: "2026-10-02"
source_title: "Hidden Technical Debt in Machine Learning Systems"
author: "D. Sculley et al."
year: "2015"
source: "Hidden Technical Debt in Machine Learning Systems"
---

# Direct and hidden feedback loops in ML systems

A model can influence the selection of its own future training data, creating a direct feedback loop. The paper discusses partial randomization and isolating some observations from model influence as mitigations. Hidden feedback loops arise when separate systems affect each other indirectly through the world, such as product and review selectors that change user interactions. These indirect loops can connect systems without an explicit data dependency.
