---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Pairwise updates and offline data in DPO]]"
---

# Offline preference optimization inherits the coverage of its response pairs

An offline pairwise dataset supplies direct comparisons only for responses and prompts it contains. A policy can generalize beyond them, but those regions are not automatically validated by a falling training loss. Dataset provenance and sampling determine which preference distinctions are observed. This resembles [[Hard negatives define the distinctions a retriever learns to make]], with response comparisons supplying the supervised contrast.
