---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Augmented positive views in SimCLR]]"
---

# Augmentation defines which changes the representation is trained to ignore

Treating two transformed examples as a positive pair encourages agreement across those transformations. An augmentation therefore expresses a task assumption about what variation should not distinguish examples. Removing information important to the downstream task can conflict with that assumption, so augmentation design is part of the representation objective rather than neutral preprocessing.
