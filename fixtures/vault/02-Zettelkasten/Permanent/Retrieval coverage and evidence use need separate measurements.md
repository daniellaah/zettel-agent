---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Evidence position in long-context question answering]]"
  - "[[Dual encoders and passage preparation in DPR]]"
---

# Retrieval coverage and evidence use need separate measurements

An answer passage can be retrieved and placed in context while the generator still fails to use it. Conversely, a fluent answer can arise without support from the retrieved evidence. End-to-end correctness alone does not locate either failure. Measuring candidate coverage and evidence-conditioned generation separately makes the diagnosis more specific and connects retrieval quality to the eventual answer behavior.
