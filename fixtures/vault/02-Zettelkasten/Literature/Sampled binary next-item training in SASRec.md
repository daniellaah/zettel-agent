---
type: "literature"
created: "2026-10-02"
source_title: "Self-Attentive Sequential Recommendation"
author: "Wang-Cheng Kang, Julian McAuley"
year: "2018"
source: "Self-Attentive Sequential Recommendation"
---

# Sampled binary next-item training in SASRec

SASRec uses binary cross-entropy terms for the expected next item and sampled items outside the user sequence. Padding targets are omitted from the loss. Its described training procedure generates one random negative item for every valid time step in each sequence during an epoch. The model parameters are optimized with Adam, and the objective uses sigmoid probabilities of the candidate scores.
