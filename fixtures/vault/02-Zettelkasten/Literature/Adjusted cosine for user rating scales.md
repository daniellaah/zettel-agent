---
type: "literature"
created: "2026-10-02"
source_title: "Item-based Collaborative Filtering Recommendation Algorithms"
author: "Badrul Sarwar, George Karypis, Joseph Konstan, John Riedl"
year: "2001"
source: "Item-based Collaborative Filtering Recommendation Algorithms"
---

# Adjusted cosine for user rating scales

Adjusted cosine compares item columns after subtracting each contributing user's average rating from their ratings on the two items. The paper motivates this by differences in the rating scales used by different people. Item-based comparisons draw co-rated values from multiple users, so ordinary cosine does not account for those scale differences. The centering uses each user's mean, rather than a single collection-wide rating average.
