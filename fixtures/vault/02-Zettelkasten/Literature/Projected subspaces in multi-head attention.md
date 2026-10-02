---
type: "literature"
created: "2026-10-02"
source_title: "Attention Is All You Need"
author: "Ashish Vaswani et al."
year: "2017"
source: "Attention Is All You Need"
---

# Projected subspaces in multi-head attention

Multi-head attention applies several learned linear projections to queries, keys, and values. Each projected set computes attention separately; the resulting value combinations are concatenated and passed through an output projection. The Transformer paper describes this as allowing attention to operate over different representation subspaces and positions. Its reported model uses reduced dimensions per head so that overall computation remains comparable to a full-dimensional single head.
