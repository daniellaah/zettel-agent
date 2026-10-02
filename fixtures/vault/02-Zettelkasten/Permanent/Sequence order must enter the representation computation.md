---
type: "permanent"
created: "2026-10-02"
source:
  - "[[Self-attentive interest extraction in ComiRec]]"
---

# Sequence order must enter the representation computation

Attention over a collection of item embeddings does not automatically encode when those items occurred. If positions never enter the computation, permuting the same history leaves the available content unchanged. Positional embeddings give the attention mechanism an ordering signal. Whether that signal is useful depends on the prediction task, but describing a model as sequential requires identifying how order reaches its representation.
