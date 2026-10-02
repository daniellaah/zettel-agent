---
type: "literature"
created: "2026-10-02"
source_title: "SWE-bench: Can Language Models Resolve Real-World GitHub Issues?"
author: "Carlos E. Jimenez, John Yang, Alexander Wettig, Shunyu Yao, Kexin Pei, Ofir Press, Karthik Narasimhan"
year: "2023"
source: "SWE-bench: Can Language Models Resolve Real-World GitHub Issues?"
---

# BM25 and reference-file contexts in SWE-bench

The paper compares file contexts selected by BM25 with an oracle context consisting of files edited by the reference patch. BM25 retrieves files within a specified context budget. The authors use the oracle setting for analysis and describe it as less realistic because the relevant edit locations are not ordinarily known in advance. They also note that edited files may omit additional context needed to understand the program.
