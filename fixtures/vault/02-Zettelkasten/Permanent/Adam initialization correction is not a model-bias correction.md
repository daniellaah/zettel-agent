---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Moment estimation and bias correction in Adam]]"
---

# Adam initialization correction is not a model-bias correction

Adam corrects a particular estimation effect caused by zero-initialized moving averages during early updates. That correction does not address class imbalance, dataset sampling bias, or bias in predictions toward a subgroup. These uses of the word bias refer to different quantities. Explaining the accumulator initialization makes the optimizer claim precise and avoids attributing unrelated statistical protections to Adam.
