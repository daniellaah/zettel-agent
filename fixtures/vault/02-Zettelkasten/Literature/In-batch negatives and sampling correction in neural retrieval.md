---
type: "literature"
created: "2026-10-02"
source_title: "Sampling-Bias-Corrected Neural Modeling for Large Corpus Item Recommendations"
author: "Xinyang Yi et al."
year: "2019"
source: "Sampling-Bias-Corrected Neural Modeling for Large Corpus Item Recommendations"
---

# In-batch negatives and sampling correction in neural retrieval

The paper encodes queries and items with separate neural networks and scores a pair through their embedding inner product. Training approximates a full-corpus softmax using the items present in a minibatch as alternatives for each query. Rewards can weight the observed positive examples.

Because batch items follow a skewed interaction distribution, popular items appear disproportionately as negatives. The authors subtract the logarithm of an item's estimated batch sampling probability from its training logit. The corrected logits define the batch loss. The probability refers to how the training batch is sampled, and the method does not require a fixed item vocabulary.
