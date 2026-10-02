---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Repeated test-set use and model selection]]"
---

# Test feedback can leak through human decisions

A test set can influence training decisions without appearing in a minibatch. If its results motivate a new architecture or a changed data pipeline, the later model selection has already used test information. Protecting evaluation independence therefore concerns the whole development process, including human choices. It is not satisfied solely by keeping test examples out of gradient computations.
