---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Exported feature transformations in TFX]]"
  - "[[Training-serving skew comparisons in Rules of ML]]"
---

# Exporting preprocessing reduces one source of skew without proving full parity

Sharing transformation logic aligns an important part of training and inference. It does not establish that upstream inputs, timestamps, defaults, or runtime behavior also agree. An identical-example comparison remains useful because the complete path to a prediction includes more than the exported transformation itself.
