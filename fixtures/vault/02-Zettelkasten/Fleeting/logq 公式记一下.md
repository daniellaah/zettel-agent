---
type: fleeting
created: 2026-05-04
tags: [inbox, recsys]
---
# logq 公式记一下

s'(u, i) = s(u, i) − log(p_i)

p_i：item i 在 batch 里出现的概率。估计：记上次出现的 step，间隔 δ，p ≈ 1/δ，做滑动平均。

别忘了温度 τ，和 correction 一起调。
