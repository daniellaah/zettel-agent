---
type: "literature"
created: "2026-10-02"
source_title: "Fast Inference from Transformers via Speculative Decoding"
author: "Yaniv Leviathan, Matan Kalman, Yossi Matias"
year: "2022"
source: "Fast Inference from Transformers via Speculative Decoding"
---

# Draft proposal verification in speculative decoding

Speculative decoding first generates a block of candidate tokens autoregressively with a cheaper draft model. The target model evaluates the distributions for their draft prefixes in parallel. Each proposed token is accepted with probability equal to the smaller of one and its target-to-draft probability ratio, using distributions adjusted for the selected sampling method. The algorithm keeps the accepted prefix up to the first rejection.
