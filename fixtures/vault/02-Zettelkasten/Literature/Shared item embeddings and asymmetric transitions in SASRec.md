---
type: "literature"
created: "2026-10-02"
source_title: "Self-Attentive Sequential Recommendation"
author: "Wang-Cheng Kang, Julian McAuley"
year: "2018"
source: "Self-Attentive Sequential Recommendation"
---

# Shared item embeddings and asymmetric transitions in SASRec

SASRec can share one item embedding matrix between its input and prediction layers. Although a direct inner product between shared item vectors is symmetric, the model applies a nonlinear history transformation before scoring a candidate. The paper illustrates that this transformed score can represent asymmetric item transitions with shared embeddings. In the reported experiments, sharing the item embeddings improves performance and reduces model size.
