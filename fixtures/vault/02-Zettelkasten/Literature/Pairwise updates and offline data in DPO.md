---
type: "literature"
created: "2026-10-02"
source_title: "Direct Preference Optimization: Your Language Model is Secretly a Reward Model"
author: "Rafael Rafailov et al."
year: "2023"
source: "Direct Preference Optimization: Your Language Model is Secretly a Reward Model"
---

# Pairwise updates and offline data in DPO

The paper describes DPO updates as increasing the likelihood of preferred responses relative to dispreferred responses, with a weight depending on how incorrectly the implicit reward orders the pair. Its pipeline constructs or reuses an offline preference dataset and optimizes against a fixed reference policy. When the dataset's original supervised model is unavailable, the paper describes fitting a reference to preferred responses to mitigate a distribution mismatch.
