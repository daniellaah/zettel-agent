---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Tool contracts and minimal agent context]]"
---

# Overlapping tools create an additional selection problem

If several tools appear to serve the same purpose without clear distinctions, the agent must first infer which interface is appropriate. That choice consumes context and creates an avoidable failure point. Descriptive boundaries reduce this ambiguity. Tool design therefore affects the reasoning problem faced by the model, even when each individual implementation returns correct results when called properly.
