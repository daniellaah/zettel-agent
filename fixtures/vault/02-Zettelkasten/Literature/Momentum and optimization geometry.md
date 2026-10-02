---
type: "literature"
created: "2026-10-02"
source_title: "Deep Learning"
author: "Ian Goodfellow, Yoshua Bengio, Aaron Courville"
year: "2016"
source: "Deep Learning"
---

# Momentum and optimization geometry

Ill-conditioning can make gradient descent slow because steep curvature limits a step that would otherwise advance along a shallow direction. Momentum maintains an exponentially decaying accumulation of past gradients and moves parameters using that accumulated direction. The book illustrates how this can reduce oscillation across a narrow valley while progressing along it, and discusses benefits for small consistent gradients and stochastic gradient noise.
