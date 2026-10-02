---
type: "literature"
created: "2026-10-02"
source_title: "TFX: A TensorFlow-Based Production-Scale Machine Learning Platform"
author: "Denis Baylor et al."
year: "2017"
source: "TFX: A TensorFlow-Based Production-Scale Machine Learning Platform"
---

# Automated model promotion checks in TFX

TFX separates safe serving from desired prediction quality. Its described validation uses a canary process to check serving safety and compares quality with both a fixed threshold and a baseline model, such as the current production model. New models failing a check are withheld from serving and teams are alerted. The paper notes that canaries do not catch every error and discusses the tradeoff between sensitivity and excessive alerts.
