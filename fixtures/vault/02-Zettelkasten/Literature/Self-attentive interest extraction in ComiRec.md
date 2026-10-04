---
type: "literature"
created: "2026-10-02"
source_title: "Controllable Multi-Interest Framework for Recommendation"
author: "Yukuo Cen et al."
year: "2020"
source: "Controllable Multi-Interest Framework for Recommendation"
---

# Self-attentive interest extraction in ComiRec

ComiRec-SA maps a sequence of item embeddings into multiple attention-weight distributions over historical items. Each distribution produces an interest vector by taking a weighted sum of the history embeddings. The model adds trainable positional embeddings when computing attention so that positions in the behavior sequence can influence the weights. These multiple interest representations feed independent candidate searches before the controllable aggregation module constructs the final recommendation list.
