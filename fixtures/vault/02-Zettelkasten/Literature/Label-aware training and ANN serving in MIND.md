---
type: "literature"
created: "2026-10-02"
source_title: "Multi-Interest Network with Dynamic Routing for Recommendation at Tmall"
author: "Chao Li et al."
year: "2019"
source: "Multi-Interest Network with Dynamic Routing for Recommendation at Tmall"
---

# Label-aware training and ANN serving in MIND

During training, MIND uses the target item's embedding as a query over the interest vectors. Label-aware attention emphasizes the interests most relevant to that target, and the attended representation participates in sampled-softmax training. The attention power controls how sharply the model selects an interest. At serving time, the label-aware attention layer is omitted: history and profile information produce multiple interest vectors, which independently retrieve candidates through approximate nearest-neighbor search.
