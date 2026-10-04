---
type: "literature"
created: "2026-10-02"
source_title: "Effective context engineering for AI agents"
author: "Prithvi Rajasekaran, Ethan Dixon, Carly Ryan, Jeremy Hadfield"
year: "2025"
source: "Effective context engineering for AI agents"
---

# Compaction for long-running agent tasks

Compaction summarizes a conversation nearing the context-window limit and starts a new context with that summary. The article describes preserving architectural decisions, unresolved bugs, and implementation details while discarding redundant messages or tool results. It warns that aggressive compression can lose subtle information needed later. Its suggested tuning process first emphasizes recall of relevant details and then removes material that does not contribute useful context.
