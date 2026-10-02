---
type: "literature"
created: "2026-10-02"
source_title: "Deep Learning"
author: "Ian Goodfellow, Yoshua Bengio, Aaron Courville"
year: "2016"
source: "Deep Learning"
---

# Validation-based early stopping

Training loss can continue decreasing after validation loss begins rising. The book describes storing parameters whenever validation error improves and returning the parameter setting with the best recorded validation performance when training stops. This uses training duration as a regularization choice. It seeks better generalization even though the training objective could still be reduced by further optimization.
