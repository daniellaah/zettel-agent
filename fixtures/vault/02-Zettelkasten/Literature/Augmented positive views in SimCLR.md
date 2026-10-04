---
type: "literature"
created: "2026-10-02"
source_title: "A Simple Framework for Contrastive Learning of Visual Representations"
author: "Ting Chen, Simon Kornblith, Mohammad Norouzi, Geoffrey Hinton"
year: "2020"
source: "A Simple Framework for Contrastive Learning of Visual Representations"
---

# Augmented positive views in SimCLR

SimCLR creates a positive pair by applying two independently sampled augmentation sequences to the same image. Its image transformations include cropping and resizing, color distortion, and Gaussian blur. The paper studies how compositions of these operations change the contrastive task and reports that combining random cropping with color distortion is particularly important in its visual representation experiments.
