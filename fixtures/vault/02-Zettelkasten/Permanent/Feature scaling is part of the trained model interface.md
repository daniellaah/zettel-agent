---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Predictor scaling before ridge regression]]"
  - "[[Training-serving skew comparisons in Rules of ML]]"
---

# Feature scaling is part of the trained model interface

A coefficient fitted to scaled inputs assumes the same transformation during serving. Feeding raw values changes the meaning of those coefficients even when names and types match. The fitted scaling parameters belong with the model artifact, and an identical-example comparison can reveal this kind of transformation mismatch.
