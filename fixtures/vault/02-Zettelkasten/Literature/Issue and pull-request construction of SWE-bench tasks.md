---
type: "literature"
created: "2026-10-02"
source_title: "SWE-bench: Can Language Models Resolve Real-World GitHub Issues?"
author: "Carlos E. Jimenez, John Yang, Alexander Wettig, Shunyu Yao, Kexin Pei, Ofir Press, Karthik Narasimhan"
year: "2023"
source: "SWE-bench: Can Language Models Resolve Real-World GitHub Issues?"
---

# Issue and pull-request construction of SWE-bench tasks

SWE-bench builds tasks from merged pull requests that resolve issues and change test files. A task retains the repository base commit, an issue description, and separate test and reference code patches. Execution filtering requires installation to succeed and at least one test to change from failing to passing after the reference solution. Issue comments are restricted to those preceding the initial pull-request commit to avoid including solution details.
