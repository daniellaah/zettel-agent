---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Residual resampling after a speculative rejection]]"
---

# Equal output distributions do not promise the same sampled token sequence

Two samplers can generate the same distribution while consuming random values differently. Matching a random seed does not by itself guarantee identical realized sequences across ordinary and speculative decoding. Correctness of the distribution-preserving algorithm and reproducibility of a particular sampled path are separate properties to test.
