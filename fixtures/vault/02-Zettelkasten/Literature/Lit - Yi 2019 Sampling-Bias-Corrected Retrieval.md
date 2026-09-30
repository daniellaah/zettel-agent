---
type: literature
created: 2026-05-05
tags: [recsys, paper, negative-sampling]
aliases: [Sampling-Bias-Corrected Neural Modeling, Yi 2019]
---
# Lit - Yi 2019 Sampling-Bias-Corrected Retrieval

**来源**：Xinyang Yi et al., "Sampling-Bias-Corrected Neural Modeling for Large Corpus Item Recommendations", RecSys 2019（Google / YouTube）

## 问题
大规模召回用双塔模型，训练时对全量 item 做 softmax 不现实，于是用 batch 内的其他样本当负样本。但训练数据是流式的、item 分布极度长尾，batch 内负采样的分布和 item 的流行度强相关，softmax 的估计是有偏的。

## 方法
### 校正 logit
对每个 batch 内的候选 item，把模型打分减去它被采样概率的对数，再做 softmax。这样热门 item 被过度当作负样本的效应被抵消。

### 流式频率估计
采样概率没法事先算好，因为 item 集合一直在变。论文用两个哈希数组：一个记每个 item 上一次出现的训练步，一个记两次出现之间的平均间隔。间隔的倒数就是出现频率的估计。这个估计能持续更新，跟上分布漂移。

### 其他工程细节
- user / item 向量做 L2 归一化，再配合温度系数。
- 以 YouTube 的推荐场景做线上实验。

## 结果
在离线召回指标和线上实验中，加上校正比不加更好；频率估计的方法本身也被单独验证过，能跟踪分布变化。

## 我的笔记
这篇是我们组做 in-batch 负采样时的标准参考。温度和校正要一起调，单独调其中一个容易得出错误结论。

## 衍生笔记
- [[LogQ 校正抵消采样偏差]]
- [[In-batch negatives oversample popular items]]
