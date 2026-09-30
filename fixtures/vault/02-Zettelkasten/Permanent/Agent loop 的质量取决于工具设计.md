---
type: permanent
created: 2026-07-15
tags: [agent, tools]
aliases: [tool design, 工具设计]
source: "[[Lit - Building Effective Agents]]"
---
# Agent loop 的质量取决于工具设计

agent loop 本身非常简单：模型决定调用哪个工具，拿到结果，再决定下一步，直到它认为可以回答为止。真正决定效果的是工具。

好的工具至少满足三点。第一，名字和描述让模型知道什么时候该用它、什么时候不该用。第二，参数难以写错，能用枚举就不用自由字符串。第三，返回简洁且可引用。

返回的粒度最难把握：一个返回整篇文档的 search 工具会迅速撑满上下文；只返回标题又逼模型多走几轮。我现在的做法是：搜索返回片段加路径，读取工具支持按标题只读某一节，每个结果带稳定 ID 便于引用。

## 关联
- 延伸 [[Context engineering is choosing what the model does not see]]：工具返回什么，就决定了上下文里有什么。
- 衡量 [[RAG 评估要把检索和生成分开打分]]：工具设计的好坏最终要靠评估集说话。
- 来源 [[Lit - Building Effective Agents]]：给模型设计工具要像给人设计界面一样用心。
