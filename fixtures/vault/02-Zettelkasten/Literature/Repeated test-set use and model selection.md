---
type: "literature"
created: "2026-10-02"
source_title: "Dive into Deep Learning"
author: "Aston Zhang, Zachary C. Lipton, Mu Li, Alexander J. Smola"
year: "2023"
source: "Dive into Deep Learning"
---

# Repeated test-set use and model selection

The book considers error estimation for a fixed classifier on independently drawn test examples. It then explains that evaluating many classifiers on one test set introduces a multiple-comparison problem. Later models may also be influenced by earlier test results, violating the assumption that the classifier was selected without contact with the test set. Validation-based tuning does not erase the information obtained from previous test evaluations.
