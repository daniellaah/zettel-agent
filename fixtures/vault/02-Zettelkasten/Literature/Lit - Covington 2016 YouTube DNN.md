---
type: literature
created: 2026-03-14
tags: [recsys, paper, retrieval]
aliases: [Deep Neural Networks for YouTube Recommendations, YouTube DNN]
---
# Lit - Covington 2016 YouTube DNN

**来源**：Paul Covington, Jay Adams, Emre Sargin, "Deep Neural Networks for YouTube Recommendations", RecSys 2016

## 两阶段结构
系统分成候选生成（candidate generation）和排序（ranking）两个网络。候选生成从百万级视频里挑出几百个，排序网络再用更丰富的特征给这几百个精细打分。这基本定义了之后几年工业推荐系统"召回 + 排序"的分工。

## 候选生成
### 建模为极多分类
把"下一个会看哪个视频"建模为一个类别数等于视频总数的分类问题，训练时用 sampled softmax 近似。

### 用户表示
用户观看历史和搜索历史的 embedding 取平均，再和人口统计、地理等特征拼接，经过几层 ReLU 得到用户向量。

### Serving
训练完成后，分类层的权重就是视频向量。线上只需要在点积空间里做近似最近邻搜索，不需要跑完整的 softmax。

## 几个我记住的细节
- 加入"样本年龄"特征，让模型能表达对新视频的偏好。
- 预测"下一次观看"而不是随机挖掉历史中的一次观看，效果更好，因为后者会泄露未来信息。
- 每个用户贡献的样本数要限制，防止重度用户主导训练。

## 衍生笔记
- [[双塔模型把召回变成最近邻搜索]]
