---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Automated model promotion checks in TFX]]"
---

# Model promotion needs serving evidence as well as quality evidence

A model with improved held-out metrics can still fail to load, exceed resource limits, or mishandle serving inputs. Promotion is a decision about the deployed system, so prediction quality and runtime compatibility need separate evidence. A canary helps test the latter while its coverage still limits what can be concluded.
