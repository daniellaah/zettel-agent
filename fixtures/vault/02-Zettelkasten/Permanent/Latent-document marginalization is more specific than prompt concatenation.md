---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Latent documents and joint training in RAG]]"
---

# Latent-document marginalization is more specific than prompt concatenation

The original RAG models define probabilities by marginalizing over retrieved latent documents at sequence or token level. A system that concatenates passages into one prompt uses a different conditioning mechanism, even if both retrieve before generating. Distinguishing these designs prevents transferring a training or decoding claim from the original probabilistic model to every modern retrieval-augmented application.
