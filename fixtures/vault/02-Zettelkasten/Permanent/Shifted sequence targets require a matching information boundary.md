---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Causal next-item supervision in SASRec]]"
  - "[[Autoregressive information flow through attention masks]]"
---

# Shifted sequence targets require a matching information boundary

Shifting labels by one position is insufficient if a representation can still access later items through attention or another cross-position computation. Every route carrying future information must respect the target position. Verifying the label alignment and computational mask together establishes what evidence the next-item predictor actually receives.
