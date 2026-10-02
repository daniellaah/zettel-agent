---
type: "literature"
created: "2026-10-02"
source_title: "Sampling-Bias-Corrected Neural Modeling for Large Corpus Item Recommendations"
author: "Xinyang Yi et al."
year: "2019"
source: "Sampling-Bias-Corrected Neural Modeling for Large Corpus Item Recommendations"
---

# Sequential training and indexed serving in neural retrieval

The YouTube system consumes training data in chronological day order and waits for new data after catching up. Its moving frequency estimates adapt alongside this stream. The authors normalize the query and item embeddings and introduce a temperature tuned for retrieval quality.

Serving uses a separate indexing pipeline: select candidate videos, obtain their features, compute item-tower embeddings, and construct an approximate inner-product index. The exported serving model combines the query tower with this index. The paper thus describes training and indexing as connected stages that prepare different parts of online retrieval.
