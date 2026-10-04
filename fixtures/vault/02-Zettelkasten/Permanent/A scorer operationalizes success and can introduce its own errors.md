---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Dataset solver and scorer roles in Inspect]]"
  - "[[Answer correctness and citation coverage in ALCE]]"
---

# A scorer operationalizes success and can introduce its own errors

Exact matching, semantic grading, and entailment checks each turn a success criterion into a measurable procedure with limitations. A score is evidence under that procedure, not an infallible label. Inspecting disagreements and calibrating automated judgments against reviewed examples helps determine what the reported metric actually measures. Changing a scorer can change results without changing the agent behavior at all.
