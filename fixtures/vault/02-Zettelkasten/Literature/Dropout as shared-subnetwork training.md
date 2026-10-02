---
type: "literature"
created: "2026-10-02"
source_title: "Deep Learning"
author: "Ian Goodfellow, Yoshua Bengio, Aaron Courville"
year: "2016"
source: "Deep Learning"
---

# Dropout as shared-subnetwork training

Dropout samples binary masks that remove input or hidden units during training. Each sampled subnetwork inherits parameters from the same underlying network. Training takes gradient steps for sampled masks rather than independently fitting every possible subnetwork. The book compares this with bagging while emphasizing shared parameters and the fact that only a small fraction of the possible subnetworks can be explicitly sampled.
