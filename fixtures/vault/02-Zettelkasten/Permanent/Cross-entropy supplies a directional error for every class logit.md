---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Softmax classification and cross-entropy gradients]]"
---

# Cross-entropy supplies a directional error for every class logit

The softmax cross-entropy derivative compares each predicted probability with its target indicator. The observed class receives pressure to gain probability, while competing classes receive pressure to lose it. This explains the gradient signal through a probabilistic discrepancy rather than through a hard correct-or-incorrect decision. It also shows why confidently incorrect predictions can still supply a strong learning signal.
