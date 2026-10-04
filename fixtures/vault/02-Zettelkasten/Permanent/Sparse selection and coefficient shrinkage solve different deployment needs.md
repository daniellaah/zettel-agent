---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Sparse coefficient selection with the lasso]]"
  - "[[Ridge penalties and coefficient shrinkage]]"
---

# Sparse selection and coefficient shrinkage solve different deployment needs

Both penalties constrain fitting, but exact zeros can remove feature computations while small nonzero coefficients usually retain their input dependencies. A deployment seeking a smaller feature pipeline therefore has an additional concern beyond coefficient magnitude. The accuracy and operational consequences of dropping a signal still need evaluation.
