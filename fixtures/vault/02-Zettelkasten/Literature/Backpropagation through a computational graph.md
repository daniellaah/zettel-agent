---
type: "literature"
created: "2026-10-02"
source_title: "Dive into Deep Learning"
author: "Aston Zhang, Zachary C. Lipton, Mu Li, Alexander J. Smola"
year: "2023"
source: "Dive into Deep Learning"
---

# Backpropagation through a computational graph

Forward propagation computes intermediate variables from inputs toward outputs and the objective. Backpropagation traverses these computations in reverse using the chain rule to obtain parameter gradients. Intermediate quantities needed for the derivative calculations are retained. The book demonstrates the process with a one-hidden-layer network whose objective contains both a prediction loss and a parameter regularization term, computing gradients through each contribution.
