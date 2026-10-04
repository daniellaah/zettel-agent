---
type: "literature"
created: "2026-10-02"
source_title: "Hidden Technical Debt in Machine Learning Systems"
author: "D. Sculley et al."
year: "2015"
source: "Hidden Technical Debt in Machine Learning Systems"
---

# Unstable upstream data dependencies

Features produced by other systems can change when their owners update models, lookup tables, or semantic mappings. A consuming model may have adapted to the previous signal, including its miscalibrations, so correcting that signal can adversely affect the consumer. The paper describes maintaining a versioned signal until an update has been vetted. This mitigation introduces costs from stale signals and maintaining multiple versions.
