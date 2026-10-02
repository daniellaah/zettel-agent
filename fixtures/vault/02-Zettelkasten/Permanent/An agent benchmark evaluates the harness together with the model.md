---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Tasks trials transcripts and environment outcomes]]"
  - "[[Dataset solver and scorer roles in Inspect]]"
---

# An agent benchmark evaluates the harness together with the model

Prompts, tool schemas, retrieval behavior, budgets, and loop control affect what a model can accomplish. Benchmark results therefore describe a configured system. Reporting only the model name leaves important experimental conditions unspecified. Separating dataset, solver, and scorer makes those conditions easier to compare while recognizing that the resulting score still belongs to the combined execution setup.
