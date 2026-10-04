---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Cosine normalization for document vectors]]"
---

# Cosine normalization does not recover lost word order

Length-normalizing a bag-of-words vector changes magnitude sensitivity without changing the information retained by the representation. Two sentences with the same term counts remain indistinguishable even when their word orders change meaning. Normalization solves one scoring issue while leaving the representational limitation intact. This connects to [[Sequence order must enter the representation computation]], which requires introducing order before scoring can exploit it.
