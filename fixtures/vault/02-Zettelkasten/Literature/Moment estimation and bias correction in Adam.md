---
type: "literature"
created: "2026-10-02"
source_title: "Deep Learning"
author: "Ian Goodfellow, Yoshua Bengio, Aaron Courville"
year: "2016"
source: "Deep Learning"
---

# Moment estimation and bias correction in Adam

Adam maintains exponentially weighted estimates of the gradient's first moment and uncentered second moment. It uses these estimates to adapt updates and includes corrections for the bias introduced by initializing the accumulators to zero. The book compares these choices with momentum and RMSProp. It also notes that learning-rate adjustment can still be needed rather than treating the suggested defaults as universally sufficient.
