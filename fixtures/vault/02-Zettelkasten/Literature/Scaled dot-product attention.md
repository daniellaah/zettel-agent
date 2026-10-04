---
type: "literature"
created: "2026-10-02"
source_title: "Attention Is All You Need"
author: "Ashish Vaswani et al."
year: "2017"
source: "Attention Is All You Need"
---

# Scaled dot-product attention

Scaled dot-product attention computes query-key inner products, divides them by the square root of key dimension, applies softmax, and uses the resulting weights to combine values. The authors motivate scaling by the increasing variance of an unscaled dot product when independent, zero-mean, unit-variance components are assumed. Large logits can push softmax into regions with small gradients. Their scaling is intended to counteract that effect.
