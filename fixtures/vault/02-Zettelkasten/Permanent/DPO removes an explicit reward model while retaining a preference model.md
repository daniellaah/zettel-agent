---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Reference-relative preference optimization in DPO]]"
---

# DPO removes an explicit reward model while retaining a preference model

Direct policy optimization avoids separately fitting and deploying a learned reward network inside an RL loop. It still relies on assumptions connecting observed pairwise preferences with an underlying ordering. Those assumptions shape the objective and its interpretation. Simpler optimization machinery therefore does not make the preference labels assumption-free or guarantee that they capture every desired behavior.
