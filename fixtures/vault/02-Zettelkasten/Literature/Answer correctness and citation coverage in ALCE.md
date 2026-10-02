---
type: "literature"
created: "2026-10-02"
source_title: "Enabling Large Language Models to Generate Text with Citations"
author: "Tianyu Gao, Howard Yen, Jiatong Yu, Danqi Chen"
year: "2023"
source: "Enabling Large Language Models to Generate Text with Citations"
---

# Answer correctness and citation coverage in ALCE

ALCE evaluates generated answers and their citations as separate dimensions. Correctness measures vary with dataset answer format, including exact-match answer recall and entailment-based claim recall. Citation recall checks whether generated statements are supported by the passages they cite. The paper uses a natural-language-inference model for automated support judgments, rather than treating the presence of a citation marker as sufficient evidence of support.
