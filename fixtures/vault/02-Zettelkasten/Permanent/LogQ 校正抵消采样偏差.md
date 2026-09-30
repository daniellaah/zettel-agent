---
type: permanent
created: 2026-05-08
tags: [recsys, negative-sampling, loss]
aliases: [logQ correction, sampling-bias correction, 采样偏差修正]
source: "[[Lit - Yi 2019 Sampling-Bias-Corrected Retrieval]]"
---
# LogQ 校正抵消采样偏差

在 in-batch 负采样下，item j 被当作负样本的概率 q_j 近似等于它在训练流里出现的频率。sampled softmax 的梯度因此是有偏的：热门 item 被过度当成负样本。

修正方法是在计算 softmax 之前，把每个候选的 logit 从 s(u, j) 改成 s(u, j) − log q_j。热门 item 的 q_j 大，减去的量也大，恰好抵消它"出现得多所以被罚得多"的那部分。

q_j 线上无法精确知道。Yi et al. 的做法是流式估计：用哈希数组记下每个 item 上一次出现的训练步数，两次出现之间的间隔 δ 做滑动平均，q_j ≈ 1/δ。这样不需要全局统计，模型可以一直在线训练。

实践中这个修正对 head item 的 recall 恢复很明显；温度系数要和它一起调。

## 关联
- 解决 [[In-batch negatives oversample popular items]]：这是 in-batch 负采样偏差的标准补丁。
- 作用对象 [[双塔模型把召回变成最近邻搜索]]：被修正的是双塔训练出的 user / item 向量。
- 来源 [[Lit - Yi 2019 Sampling-Bias-Corrected Retrieval]]
