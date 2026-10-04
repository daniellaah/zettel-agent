---
type: "literature"
created: "2026-10-02"
source_title: "Fast Inference from Transformers via Speculative Decoding"
author: "Yaniv Leviathan, Matan Kalman, Yossi Matias"
year: "2022"
source: "Fast Inference from Transformers via Speculative Decoding"
---

# Acceptance cost and lookahead in speculative speedup

The paper models tokens produced per speculative iteration using an average acceptance probability and the draft lookahead length. Its expected-token calculation assumes independent, identically distributed acceptance probabilities. The walltime analysis also assumes enough computation for concurrent target evaluations without increased target latency and includes the draft cost. Lookahead selection trades additional draft work against the diminishing expected number of accepted tokens.
