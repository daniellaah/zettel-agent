---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Sequential training and indexed serving in neural retrieval]]"
---

# A shared temperature changes training probabilities without changing score order

Dividing every candidate score for a query by the same positive temperature preserves the order of those scores. It nevertheless changes the probabilities produced by a softmax and the gradients derived from them. Temperature can therefore affect learned representations even when applying it to fixed inference scores would leave top-K unchanged.

This distinction matters when explaining a retrieval model: separate changes to training dynamics from transformations that preserve ranking for an already trained model.
