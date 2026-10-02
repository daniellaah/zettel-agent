---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Feature subsampling to decorrelate random forests]]"
---

# More trees cannot fully compensate for highly correlated predictions

Averaging suppresses variation that differs across predictors, while shared variation survives the average. Adding similarly behaving trees can therefore give diminishing variance reduction. Feature subsampling changes the dependence among trees, making diversity in their errors a distinct design choice from simply increasing the ensemble size.
