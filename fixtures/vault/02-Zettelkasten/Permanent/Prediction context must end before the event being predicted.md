---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Temporal labels and user weighting in YouTube retrieval]]"
---

# Prediction context must end before the event being predicted

A future-event prediction task requires features that would have existed before the target event. Randomly removing one event while retaining later actions can disclose information unavailable at the intended decision time. A model can then perform well on the offline task for reasons that do not transfer to serving.

Temporal boundaries are therefore part of the task definition. They should be checked alongside labels and sampling before attributing a metric gain to a better representation.
