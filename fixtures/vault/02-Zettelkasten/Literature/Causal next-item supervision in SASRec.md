---
type: "literature"
created: "2026-10-02"
source_title: "Self-Attentive Sequential Recommendation"
author: "Wang-Cheng Kang, Julian McAuley"
year: "2018"
source: "Self-Attentive Sequential Recommendation"
---

# Causal next-item supervision in SASRec

SASRec trains a sequence model to predict the next item at each position using the preceding actions. The expected outputs are a one-position shift of the input action sequence. Self-attention links to later positions are forbidden so that the representation for a position cannot use future actions. The point-wise feed-forward computation also does not mix information between positions.
