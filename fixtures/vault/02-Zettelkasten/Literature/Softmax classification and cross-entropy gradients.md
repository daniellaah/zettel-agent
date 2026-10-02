---
type: "literature"
created: "2026-10-02"
source_title: "Dive into Deep Learning"
author: "Aston Zhang, Zachary C. Lipton, Mu Li, Alexander J. Smola"
year: "2023"
source: "Dive into Deep Learning"
---

# Softmax classification and cross-entropy gradients

Softmax converts class logits into positive probabilities normalized to sum to one. For a one-hot target, cross-entropy is the negative logarithm of the probability assigned to the observed class. Combining softmax with this loss gives a logit derivative equal to the predicted class probability minus its target indicator. The book derives this expression and relates it to the difference between an observation and a model estimate.
