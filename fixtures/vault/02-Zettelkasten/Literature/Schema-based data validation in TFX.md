---
type: "literature"
created: "2026-10-02"
source_title: "TFX: A TensorFlow-Based Production-Scale Machine Learning Platform"
author: "Denis Baylor et al."
year: "2017"
source: "TFX: A TensorFlow-Based Production-Scale Machine Learning Platform"
---

# Schema-based data validation in TFX

TFX validates datasets against a versioned schema describing feature names, types, presence, valency, and expected domains. Deviations are reported as potential anomalies with descriptions and suggested actions. Some anomalies reflect expected data evolution and require schema updates; others indicate data problems that need repair. Teams maintain the schema, with tools that help derive an initial version and suggest changes as data evolves.
