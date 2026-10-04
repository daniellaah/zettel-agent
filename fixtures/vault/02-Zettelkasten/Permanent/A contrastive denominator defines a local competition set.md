---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Normalized temperature-scaled contrastive loss in SimCLR]]"
  - "[[In-batch negatives and sampling correction in neural retrieval]]"
---

# A contrastive denominator defines a local competition set

For a fixed anchor, the loss compares its positive with the views available in the minibatch. Changing the batch changes the competing examples and therefore the gradient, even when the positive pair is unchanged. This connects contrastive batch design with retrieval sampling: the alternatives and their distribution are part of the learning setup.
