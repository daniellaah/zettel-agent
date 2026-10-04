---
type: "literature"
created: "2026-10-02"
source_title: "Self-Attentive Sequential Recommendation"
author: "Wang-Cheng Kang, Julian McAuley"
year: "2018"
source: "Self-Attentive Sequential Recommendation"
---

# Sampled candidate evaluation in SASRec

SASRec reports Hit Rate at ten and NDCG at ten. For each user, its evaluation ranks the ground-truth next item with one hundred randomly sampled negative items to avoid scoring every user-item pair. With one relevant test item per user, hit rate equals recall at the same cutoff and is proportional to precision. NDCG additionally distinguishes the position of the relevant item.
