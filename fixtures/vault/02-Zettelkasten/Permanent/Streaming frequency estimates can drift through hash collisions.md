---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Streaming estimation of item sampling probabilities]]"
---

# Streaming frequency estimates can drift through hash collisions

A hash bucket can receive appearances from several item identifiers. Treating its update gap as the recurrence gap of one item makes that item appear more frequent than it really is. A correction based on the resulting probability then inherits an estimation error from the storage scheme.

Multiple independent hashings reduce this collision effect but do not remove every source of uncertainty. The estimator's approximation should remain visible when interpreting [[Sampling correction must describe the actual negative sampler]].
