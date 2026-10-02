---
type: "literature"
created: "2026-10-02"
source_title: "Rules of Machine Learning: Best Practices for ML Engineering"
author: "Martin Zinkevich"
year: ""
source: "Rules of Machine Learning: Best Practices for ML Engineering"
---

# Ranking exposure and positional features in Rules of ML

The guide notes that changing a ranking algorithm changes which results users see and therefore changes future training observations. Display position also affects the likelihood of interaction. It describes learning separate positional features during training while assigning candidates a common position value at serving, before their order is known. It advises keeping position effects separate from other model features because of this training-serving asymmetry.
