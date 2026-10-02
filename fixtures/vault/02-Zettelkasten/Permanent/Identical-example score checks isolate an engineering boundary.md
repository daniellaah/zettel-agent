---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Simple models and independent infrastructure tests]]"
  - "[[Training-serving skew comparisons in Rules of ML]]"
---

# Identical-example score checks isolate an engineering boundary

A fixed model should compute the same score for the same example across training and serving environments, subject to explicit numerical tolerances. This check isolates implementation consistency from distribution change. Passing it does not establish that live examples resemble training data. It does establish a useful boundary for investigation: score disagreement on identical inputs points toward the execution or feature-processing path.
