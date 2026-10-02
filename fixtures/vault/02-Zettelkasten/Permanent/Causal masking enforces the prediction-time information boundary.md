---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Autoregressive information flow through attention masks]]"
---

# Causal masking enforces the prediction-time information boundary

A causal attention mask prevents a token representation from using subsequent positions when learning autoregressive prediction. It enforces which information is allowed, not just which information the model should prefer. This is a computational counterpart of [[Prediction context must end before the event being predicted]]: training inputs should respect the information boundary available when the prediction will actually be made.
