---
type: "literature"
created: "2026-10-02"
source_title: "A Simple Framework for Contrastive Learning of Visual Representations"
author: "Ting Chen, Simon Kornblith, Mohammad Norouzi, Geoffrey Hinton"
year: "2020"
source: "A Simple Framework for Contrastive Learning of Visual Representations"
---

# Normalized temperature-scaled contrastive loss in SimCLR

A SimCLR minibatch contains two augmented views of each of N images. For an anchor view, its paired view is the positive and the other two times N minus two views are negatives. The loss uses cosine similarity divided by a temperature, excludes the anchor itself from the denominator, and includes the positive there. Training averages the loss across both directions of every positive pair.
