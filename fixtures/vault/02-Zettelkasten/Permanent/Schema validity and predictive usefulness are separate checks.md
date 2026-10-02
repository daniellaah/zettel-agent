---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Schema-based data validation in TFX]]"
  - "[[Automated model promotion checks in TFX]]"
---

# Schema validity and predictive usefulness are separate checks

A dataset can satisfy type, presence, and domain rules while its feature relationships no longer support a useful model. Conversely, an accurate model on corrupted examples can give misleading validation results. Data-contract checks and prediction-quality checks address different failure modes and are both needed when deciding whether to promote a model.
