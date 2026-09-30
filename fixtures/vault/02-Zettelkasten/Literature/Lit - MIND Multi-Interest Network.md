---
type: literature
created: 2026-04-09
tags: [recsys, paper, multi-interest]
aliases: [MIND, Multi-Interest Network with Dynamic Routing]
---
# Lit - MIND Multi-Interest Network

**来源**：Chao Li et al., "Multi-Interest Network with Dynamic Routing for Recommendation at Tmall", CIKM 2019

## 动机
召回阶段通常用一个向量表示一个用户。但一个用户可能同时对母婴用品、运动鞋和电子产品感兴趣，把这些行为压成一个向量，得到的是几个兴趣的"平均"，离哪个兴趣都不近，召回结果会偏向最强的那个兴趣或者变得模糊。

## 方法
### 多兴趣抽取层
借用胶囊网络的动态路由，把用户的行为序列（每个行为是一个 item embedding）聚合成 K 个兴趣胶囊。路由过程类似一个软聚类：迭代地决定每个行为属于哪个兴趣。论文里 K 可以随用户行为数量动态调整。

### Label-aware attention
训练时，用目标 item 对 K 个兴趣向量做注意力加权，得到一个用于计算 loss 的用户向量；这样每个兴趣向量只需要对"它负责的那类 item"打分高。

### Serving
线上每个兴趣向量各自做一次最近邻检索，结果合并后送给排序。

## 我的疑问
- K 太大时兴趣向量会不会变得很相似，白白增加检索开销？
- 线上检索开销是单向量的 K 倍，合并时怎么分配每个兴趣的配额？

## 相关
- 与 [[双塔模型把召回变成最近邻搜索]] 的关系：MIND 仍然是双塔式的召回，只是 user 塔输出多个向量。
