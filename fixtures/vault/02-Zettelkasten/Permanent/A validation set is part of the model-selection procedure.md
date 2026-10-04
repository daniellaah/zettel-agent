---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Repeated test-set use and model selection]]"
  - "[[Validation-based early stopping]]"
---

# A validation set is part of the model-selection procedure

Choosing hyperparameters or a stopping checkpoint from validation performance makes that set part of how the model is selected. Its score is consequently different evidence from an untouched final test. This role does not make validation useless; it explains its purpose. The distinction should remain explicit when reporting the estimate intended to describe performance beyond the selection process.
