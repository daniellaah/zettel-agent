---
type: "permanent"
created: "2026-10-02"
source:
  - "[[LoRA merging and adapter storage]]"
---

# Adapter merging trades runtime flexibility for a combined weight representation

Absorbing a low-rank update into the base matrix can remove its separate inference path. Keeping updates separate instead supports selecting among adaptations while sharing the base. These are deployment choices rather than different learned objectives. An efficiency claim should specify whether the measured system uses merged weights or dynamically selected modules, because the runtime and storage arrangements differ.
