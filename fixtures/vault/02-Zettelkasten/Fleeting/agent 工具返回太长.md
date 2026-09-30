---
type: fleeting
created: 2026-07-14
tags: [inbox, agent]
---
# agent 工具返回太长

试了一下让 agent 用 read_note 直接读整篇 lit 笔记，三轮之后 context 就满了，后面的回答开始编引用。

改成：search 只返回 snippet + path；read 支持按 heading 只读一节。

evaluation 要加一条：引用的段落是否真的出现在它读过的内容里。
