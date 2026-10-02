---
type: "literature"
created: "2026-10-02"
source_title: "Building effective agents"
author: "Erik Schluntz, Barry Zhang"
year: "2024"
source: "Building effective agents"
---

# Prompt chaining and intermediate gates

Prompt chaining divides a task into a fixed sequence of simpler model calls, each processing the previous step's output. The article describes programmatic gates between steps to check whether intermediate results satisfy requirements. It presents this pattern for tasks that can be cleanly decomposed into known subtasks, such as checking an outline before writing the full document. Additional calls trade latency for potentially easier individual prediction problems.
