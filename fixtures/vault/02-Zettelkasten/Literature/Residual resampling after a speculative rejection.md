---
type: "literature"
created: "2026-10-02"
source_title: "Fast Inference from Transformers via Speculative Decoding"
author: "Yaniv Leviathan, Matan Kalman, Yossi Matias"
year: "2022"
source: "Fast Inference from Transformers via Speculative Decoding"
---

# Residual resampling after a speculative rejection

When a draft token is rejected, speculative sampling draws a replacement from the normalized positive part of the target distribution minus the draft distribution for that prefix. The paper proves that combining acceptance with this residual sampling preserves the target distribution. If all proposed tokens are accepted, the algorithm draws one additional token directly from the target distribution after the accepted block.
