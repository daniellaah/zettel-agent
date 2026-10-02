---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Augmented positive views in SimCLR]]"
  - "[[Bootstrap resampling for estimator variability]]"
---

# Two views of one example do not provide two independent observations

Augmented views share their source example, just as bootstrap repetitions reuse source observations. A larger number of constructed views can create more training comparisons without adding an equal number of independently collected examples. Splits and uncertainty claims should preserve the relationship to those underlying examples rather than counting every transformation as independent evidence.
