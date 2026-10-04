---
type: "literature"
created: "2026-10-02"
source_title: "BPR: Bayesian Personalized Ranking from Implicit Feedback"
author: "Steffen Rendle, Christoph Freudenthaler, Zeno Gantner, Lars Schmidt-Thieme"
year: "2009"
source: "BPR: Bayesian Personalized Ranking from Implicit Feedback"
---

# Pairwise logistic likelihood and priors in BPR

BPR models the probability of a user preferring one item over another with a logistic function of a pairwise score. Its maximum-posterior criterion sums log probabilities and adds parameter regularization from a normal prior. The paper applies this criterion to matrix factorization using the difference between two user-item scores. It relates the criterion to AUC while distinguishing its smooth log-sigmoid objective and weighting from the AUC statistic.
