---
type: "literature"
created: "2026-10-02"
source_title: "SWE-bench: Can Language Models Resolve Real-World GitHub Issues?"
author: "Carlos E. Jimenez, John Yang, Alexander Wettig, Shunyu Yao, Kexin Pei, Ofir Press, Karthik Narasimhan"
year: "2023"
source: "SWE-bench: Can Language Models Resolve Real-World GitHub Issues?"
---

# Patch application and regression tests in SWE-bench grading

SWE-bench evaluates a proposed patch by applying it to the task codebase and running the task-associated tests. A successful resolution requires the patch to apply and those tests to pass. The tests include cases failing before the reference fix and additional cases that check existing functionality. The reported benchmark metric is the fraction of task instances resolved under this procedure.
