---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Ranking exposure and positional features in Rules of ML]]"
  - "[[Direct and hidden feedback loops in ML systems]]"
---

# Observed clicks partly reflect the policy that exposed items

Clicks are collected after a ranking policy chooses which items appear and where they appear. Training on those clicks therefore learns from observations shaped by an earlier policy. Updating the policy changes future evidence. This connects exposure modeling with feedback analysis: a click label is useful supervision, but it cannot be interpreted as an unbiased observation of preference without additional assumptions or design.
