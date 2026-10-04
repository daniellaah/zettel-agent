---
type: "permanent"
created: "2026-10-02"
source:
  - "[[In-batch negatives and sampling correction in neural retrieval]]"
---

# Sampling correction must describe the actual negative sampler

A sampling correction compensates for the distribution that generated the alternatives in the training loss. For interaction-sampled batches, that distribution reflects which items appear in those batches. Substituting a different popularity statistic can therefore correct the wrong sampling process.

Before applying LogQ, specify the negative sampler, the event whose probability is being estimated, and how repeated items are handled. [[Streaming frequency estimates can drift through hash collisions]] describes one source of error in estimating that probability.
