---
type: permanent
created: 2026-04-19
tags: [recsys, i2i, retrieval]
aliases: [Swing i2i, Swing]
source: "[[Lit - Swing Alibaba 2020]]"
---
# Swing 相似度惩罚热门共同用户

传统 ItemCF 用共现次数衡量两个商品的相似度：同时点过 i 和 j 的用户越多，i 和 j 越像。问题是兴趣广泛的用户（什么都点）会制造大量没有意义的共现。

Swing 换了一个角度，看"用户对"：如果用户 u 和 v 都点过 i 和 j，就构成一个 swing 结构。每个 swing 的贡献按 1/(α + |I_u ∩ I_v|) 衰减——u 和 v 共同点过的东西越多，这对用户提供的证据越弱。

直觉是：两个什么都买的人碰巧都买了 i 和 j，说明不了什么；两个兴趣很窄的人都买了 i 和 j，才说明这两个商品真的有关系。实现里还会再惩罚单个用户的活跃度。

在我做过的几次 i2i 召回里，Swing 生成的相似表比 ItemCF 稳定，长尾商品上尤其明显。

## 关联
- 评估 [[Recall@k 只衡量候选集而非最终排序]]：离线比较 Swing 和 ItemCF 时，用的是不同 k 下的 recall。
- 来源 [[Lit - Swing Alibaba 2020]]：原始定义和替代品关系的应用场景。
