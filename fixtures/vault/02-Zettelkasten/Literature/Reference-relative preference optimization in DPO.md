---
type: "literature"
created: "2026-10-02"
source_title: "Direct Preference Optimization: Your Language Model is Secretly a Reward Model"
author: "Rafael Rafailov et al."
year: "2023"
source: "Direct Preference Optimization: Your Language Model is Secretly a Reward Model"
---

# Reference-relative preference optimization in DPO

DPO derives a policy objective from KL-regularized reward maximization and a preference model. Rewriting rewards in terms of policy-to-reference probability ratios makes a prompt-dependent partition function cancel in pairwise preference comparisons. The resulting loss directly trains the policy on preferred and dispreferred responses without fitting a separate reward model or running an RL optimization loop. The derivation relies on the assumed preference model and reference policy.
