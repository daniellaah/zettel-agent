---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Multi-interest representations in MIND]]"
  - "[[Self-attentive interest extraction in ComiRec]]"
---

# A learned interest slot does not supply its own semantic label

An interest vector is learned to support item matching, not to name a human-readable topic. Attention weights or routed behaviors can help inspect a slot, but they do not establish a stable semantic identity across users or training runs. Interpreting a slot as a named preference needs additional evidence beyond the existence of multiple vectors in the model.
