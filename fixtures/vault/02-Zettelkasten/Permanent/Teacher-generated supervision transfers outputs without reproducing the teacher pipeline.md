---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Cold-start training and supervised data in DeepSeek-R1]]"
---

# Teacher-generated supervision transfers outputs without reproducing the teacher pipeline

Fine-tuning a student on teacher-generated examples can transfer useful response patterns while using a different optimization process from the teacher's own reinforcement learning. This makes distillation a training intervention in its own right. A smaller distilled model's behavior cannot be attributed solely to running the teacher's RL recipe at a smaller scale; the supplied supervision and student initialization also matter.
