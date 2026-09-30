---
type: permanent
created: 2026-07-18
tags: [agent, context]
aliases: [上下文工程, context engineering]
---
# Context engineering is choosing what the model does not see

The context window is a budget, and most of the work of spending it well is exclusion. Every retrieved passage competes for the model's attention with every other one, and irrelevant-but-plausible text is worse than useless: the model tends to treat whatever is in front of it as evidence.

So context engineering is less about stuffing and more about selection, compression and ordering. Retrieve narrowly. Summarize tool outputs before they re-enter the loop. Drop stale turns once their conclusions have been recorded. Put the most important material where the model is least likely to skim past it.

One rule matters for safety as much as quality: keep instructions and retrieved data clearly separated, so that text inside a document can never pass itself off as an instruction to the model.

## Links
- Driven by [[Agent loop 的质量取决于工具设计]]: tool outputs are the largest source of context growth in a long loop.
- Uses [[RRF 融合只依赖排名不依赖分数]]: fusion decides which few passages make the cut.
