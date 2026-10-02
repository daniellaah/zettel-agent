---
type: "literature"
created: "2026-10-02"
source_title: "A Simple Framework for Contrastive Learning of Visual Representations"
author: "Ting Chen, Simon Kornblith, Mohammad Norouzi, Geoffrey Hinton"
year: "2020"
source: "A Simple Framework for Contrastive Learning of Visual Representations"
---

# Projection heads and downstream representations in SimCLR

SimCLR applies a small nonlinear projection head between the encoder representation and the contrastive loss. After training, it discards the projection head and uses the encoder output for downstream tasks. The authors compare identity, linear, and nonlinear heads and report better linear-evaluation results with a nonlinear head. They also report that the representation before the head performs better than its projected output in that evaluation.
