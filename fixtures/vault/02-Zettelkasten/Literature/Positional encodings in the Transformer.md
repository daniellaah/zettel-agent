---
type: "literature"
created: "2026-10-02"
source_title: "Attention Is All You Need"
author: "Ashish Vaswani et al."
year: "2017"
source: "Attention Is All You Need"
---

# Positional encodings in the Transformer

Since the Transformer architecture uses neither recurrence nor convolution, the paper adds position information to the token embeddings entering the encoder and decoder. Its sinusoidal encoding uses different frequencies across dimensions. The authors also compare learned positional embeddings and obtain similar results in that experiment. They select sinusoids partly because of a hypothesized ability to extrapolate beyond training sequence lengths, rather than reporting that extrapolation as guaranteed.
