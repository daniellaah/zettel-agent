---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Softmax classification and cross-entropy gradients]]"
---

# A softmax probability depends on its competing classes

Softmax normalizes each logit against the other logits in the same candidate set. Changing that set can change probabilities even if the original logits stay fixed. A probability produced over sampled alternatives therefore needs its normalization context. This connects to [[Sampling correction must describe the actual negative sampler]], where the training alternatives shape the statistical meaning of the learned objective.
