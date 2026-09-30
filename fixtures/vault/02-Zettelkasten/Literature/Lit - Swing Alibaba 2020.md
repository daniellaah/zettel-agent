---
type: literature
created: 2026-04-18
tags: [recsys, paper, i2i]
aliases: [Large Scale Product Graph Construction, Swing paper]
---
# Lit - Swing Alibaba 2020

**来源**：Xiaoyong Yang et al., "Large Scale Product Graph Construction for Recommendation in E-commerce", arXiv 2020（阿里巴巴）

## 要解决什么
电商推荐需要两种商品关系：替代关系（看了这个手机，也可能看另一个手机）和互补关系（买了手机，可能需要手机壳）。两者的信号来源和方向性都不同，不能用同一个相似度来建。

## Swing：替代关系
### 思路
不看单个用户的共现，而是看"两个用户都点过同一对商品"的结构。如果两个用户的共同点击很少，他们同时点过 i 和 j 就是强证据；如果两个用户本来就什么都一起点，这个证据就很弱。

### 做法
对每一对共同点过 i 和 j 的用户，贡献一个随两人共同点击数增大而衰减的权重，再对所有用户对求和。论文还对用户本身的活跃度做了额外的降权。

### 效果
相比传统的基于共现的协同过滤，对噪声点击更鲁棒，尤其在活跃用户很多的场景。

## Surprise：互补关系
利用购买序列的先后顺序，在类目层面、商品层面和聚类层面分别估计互补关系，再组合起来。这部分我还没细读。

## 我的笔记
Swing 在我们的 i2i 召回里已经是默认 baseline 之一。实现时用户对的数量会爆炸，需要对每个 item 的用户列表截断。

## 衍生笔记
- [[Swing 相似度惩罚热门共同用户]]
