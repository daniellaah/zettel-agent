---
type: "literature"
created: "2026-10-02"
source_title: "TFX: A TensorFlow-Based Production-Scale Machine Learning Platform"
author: "Denis Baylor et al."
year: "2017"
source: "TFX: A TensorFlow-Based Production-Scale Machine Learning Platform"
---

# Exported feature transformations in TFX

TFX implements feature transformations such as categorical value-to-integer mappings for training and serving. These mappings allow weights or embeddings to be looked up by feature value and can restrict IDs to selected values from large vocabularies. The paper emphasizes consistent transformation logic across training and inference. It exports the transformations as part of the trained model to prevent this form of training-serving discrepancy.
