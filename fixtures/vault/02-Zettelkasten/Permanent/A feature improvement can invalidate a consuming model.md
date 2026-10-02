---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Unstable upstream data dependencies]]"
---

# A feature improvement can invalidate a consuming model

A downstream model learns relationships involving the signals it actually observed. Correcting an upstream calibration or representation can change those relationships even when the new signal is better by its own standard. Versioning and coordinated evaluation make the dependency explicit. This is a model-interface issue: the meaning and distribution of a feature are part of what the consumer has learned to rely on.
