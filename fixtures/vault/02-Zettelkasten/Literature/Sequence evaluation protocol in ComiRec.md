---
type: "literature"
created: "2026-10-02"
source_title: "Controllable Multi-Interest Framework for Recommendation"
author: "Yukuo Cen et al."
year: "2020"
source: "Controllable Multi-Interest Framework for Recommendation"
---

# Sequence evaluation protocol in ComiRec

ComiRec's public-dataset experiments divide users into training, validation, and test groups in an 8:1:1 ratio. Training uses the sequences of training users. For validation and test users, the first 80 percent of behaviors provide context, and the remaining behaviors provide prediction targets. Histories are truncated to 20 items for Amazon Books and 50 for Taobao. The evaluation reports recall, NDCG, and hit rate, and averages recall over users.
