---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Exported feature transformations in TFX]]"
---

# A categorical mapping is part of embedding compatibility

An embedding row represents the category assigned to that integer during training. Changing a vocabulary mapping while retaining the weight matrix can silently attach learned parameters to different categories. Compatibility therefore includes the mapping and its treatment of unknown values, even when the matrix dimensions remain unchanged.
