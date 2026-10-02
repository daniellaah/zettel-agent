---
type: "literature"
created: "2026-10-02"
source_title: "Billion-scale similarity search with GPUs"
author: "Jeff Johnson, Matthijs Douze, Hervé Jégou"
year: "2017"
source: "Billion-scale similarity search with GPUs"
---

# Product quantization and asymmetric distance computation

Product quantization divides a vector into subvectors and quantizes each part with its own codebook. Concatenating the subvector codes produces a compact representation whose possible combinations greatly exceed the size of the individual codebooks.

Faiss uses query-dependent lookup tables to estimate distances to these codes. The query remains uncompressed while database residuals are quantized, which gives the computation its asymmetric form. Summing table entries avoids reconstructing every full database vector during scanning. The resulting distances remain estimates of distances to the original vectors.
