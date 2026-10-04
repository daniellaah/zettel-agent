---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Pairwise logistic likelihood and priors in BPR]]"
---

# Pairwise score differences leave a user-specific score offset unidentified

Adding the same constant to every score for one user leaves all within-user score differences unchanged. The pairwise likelihood therefore cannot identify that common offset through comparisons alone, although parameter regularization or the model structure can constrain it. Absolute scores should not be interpreted as a measured preference level solely from the ranking objective.
