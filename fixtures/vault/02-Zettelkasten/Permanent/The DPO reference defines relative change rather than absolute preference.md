---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Reference-relative preference optimization in DPO]]"
  - "[[Pairwise updates and offline data in DPO]]"
---

# The DPO reference defines relative change rather than absolute preference

DPO compares preferred and dispreferred responses through their probability ratios relative to a reference policy. Changing the reference changes those ratios even when the trainable policy is fixed. The reference is consequently part of the learning problem, not incidental bookkeeping. Preference-training reports should identify it alongside the dataset and regularization coefficient before comparing update behavior.
