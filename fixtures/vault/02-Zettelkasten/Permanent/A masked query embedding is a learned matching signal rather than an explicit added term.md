---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Masked query augmentation in ColBERT]]"
---

# A masked query embedding is a learned matching signal rather than an explicit added term

The model can produce contextual vectors for masked query positions without emitting a readable expansion word. Inspecting those vectors as if they were literal query text would misdescribe the mechanism. An explanation of augmentation should distinguish additional learned matching capacity from a separately generated textual query.
