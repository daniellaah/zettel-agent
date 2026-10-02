---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Dropout as shared-subnetwork training]]"
---

# Dropout subnetworks share evidence through their parameters

Dropout creates many possible masked computation paths while storing one shared parameter collection. Updating a sampled path changes parameters also used by other paths. Its ensemble analogy therefore differs from independently training separate networks to convergence. Parameter sharing is what makes the construction feasible, and it also limits how literally the subnetworks can be treated as independent ensemble members.
