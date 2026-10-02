---
type: "literature"
created: "2026-10-02"
source_title: "Billion-scale similarity search with GPUs"
author: "Jeff Johnson, Matthijs Douze, Hervé Jégou"
year: "2017"
source: "Billion-scale similarity search with GPUs"
---

# Inverted-file pruning in Faiss similarity search

The Faiss paper describes IVFADC as a two-level quantization scheme for nearest-neighbor search. A coarse quantizer assigns database vectors to inverted lists. A finer quantizer represents the residual left after subtracting the coarse representative.

For a query, the system selects a subset of coarse representatives and scans their associated lists. Distances are estimated using the quantized representations rather than the original database vectors. This restricts the search to selected regions and avoids examining every stored vector. The number of scanned lists controls the extent of that restricted search.
