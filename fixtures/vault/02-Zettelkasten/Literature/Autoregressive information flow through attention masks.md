---
type: "literature"
created: "2026-10-02"
source_title: "Attention Is All You Need"
author: "Ashish Vaswani et al."
year: "2017"
source: "Attention Is All You Need"
---

# Autoregressive information flow through attention masks

The Transformer decoder permits a position to attend only to earlier positions and itself during decoder self-attention. The paper enforces this by setting the logits for disallowed connections to negative infinity before softmax, preventing attention weights from flowing to subsequent positions. This differs from the encoder's unrestricted self-attention and preserves the autoregressive property required when generating output tokens one at a time.
