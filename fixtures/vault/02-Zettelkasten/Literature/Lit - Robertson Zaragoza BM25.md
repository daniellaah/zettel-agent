---
type: literature
created: 2026-06-18
tags: [ir, paper, bm25]
aliases: [The Probabilistic Relevance Framework, BM25 and Beyond]
---
# Lit - Robertson Zaragoza BM25

**来源**：Stephen Robertson & Hugo Zaragoza, "The Probabilistic Relevance Framework: BM25 and Beyond", *Foundations and Trends in Information Retrieval*, 2009

## 框架
BM25 来自概率相关性框架：按文档相关的概率排序。最后得到的是一个对每个查询词求和的打分函数：IDF 乘以一个经过饱和处理的词频项。

## k1：词频饱和
词频对相关性的贡献不是线性的：一个词出现 1 次和 2 次差别很大，出现 20 次和 21 次几乎没有差别。k1 控制饱和的速度，k1 越小越快饱和；常见取值在 1.2 到 2.0 之间。

## b：文档长度归一化
b 控制按文档长度惩罚的程度：b = 0 时完全不归一化，b = 1 时完全按长度与平均长度的比值归一化；常用 0.75。

## BM25F
对有多个字段的文档，先按字段加权合并词频，再做一次饱和，而不是每个字段各算一个 BM25 再相加。对笔记很有用：标题和别名可以比正文权重高。

## 我的实现笔记
插件原型的打分函数草稿：

```python
# bm25 打分草稿，k1=1.2, b=0.75
import math

# idf 用 Lucene 的 +1 版本，保证非负
def idf(n_docs, df):
    return math.log((n_docs - df + 0.5) / (df + 0.5) + 1)

def score(tf, df, doc_len, avg_len, n_docs, k1=1.2, b=0.75):
    norm = k1 * (1 - b + b * doc_len / avg_len)
    return idf(n_docs, df) * tf * (k1 + 1) / (tf + norm)
```

## 衍生笔记
- [[BM25 在专有名词查询上胜过稠密检索]]
